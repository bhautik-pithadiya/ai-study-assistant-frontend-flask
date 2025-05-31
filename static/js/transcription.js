let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let chunkCounter = 0;
let failedChunks = [];

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const chunkInfo = document.getElementById('chunkInfo');
const transcriptContainer = document.getElementById('transcriptContainer');

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                chunkCounter++;
                try {
                    // Convert blob to array buffer
                    const arrayBuffer = await event.data.arrayBuffer();
                    // Convert to base64
                    const base64Audio = btoa(
                        new Uint8Array(arrayBuffer)
                            .reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );

                    // Send chunk to server
                    await sendAudioChunk(base64Audio, chunkCounter);
                    
                    updateChunkInfo(true);
                } catch (error) {
                    console.error('Error processing chunk:', error);
                    failedChunks.push({
                        chunk: event.data,
                        index: chunkCounter
                    });
                    updateChunkInfo(true, true);
                }
            }
        };

        mediaRecorder.start(1000); // 1 second chunks
        isRecording = true;
        updateUI(true);
        updateChunkInfo(true);
    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
    }
}

async function sendAudioChunk(base64Audio, chunkIndex) {
    try {
        // Log the request data
        console.log(`Sending chunk ${chunkIndex}...`);
        
        const response = await fetch('/transcribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audio: base64Audio,
                chunk_index: chunkIndex,
                audio_mime_type: 'audio/webm;codecs=opus'
            })
        });

        // Log the response status
        console.log(`Response status for chunk ${chunkIndex}:`, response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Error response for chunk ${chunkIndex}:`, errorText);
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }

        const result = await response.json();
        console.log(`Chunk ${chunkIndex} processed successfully:`, result);
        
        if (result.transcript) {
            addTranscript(result.transcript, result.confidence);
        } else {
            console.warn(`No transcript in response for chunk ${chunkIndex}:`, result);
        }
    } catch (error) {
        console.error(`Error processing chunk ${chunkIndex}:`, error);
        failedChunks.push({
            index: chunkIndex,
            error: error.message
        });
        updateChunkInfo(true, true);
        throw error;
    }
}

function addTranscript(text, confidence) {
    // Remove the placeholder text if it exists
    if (transcriptContainer.querySelector('.text-muted')) {
        transcriptContainer.innerHTML = '';
    }

    const transcriptItem = document.createElement('div');
    transcriptItem.className = 'transcript-item';
    
    // Add confidence badge
    const confidenceClass = getConfidenceClass(confidence);
    transcriptItem.innerHTML = `
        ${text}
        <span class="confidence-badge ${confidenceClass}">
            ${(confidence * 100).toFixed(1)}% confidence
        </span>
    `;
    
    transcriptContainer.appendChild(transcriptItem);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

function getConfidenceClass(confidence) {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
}

function updateChunkInfo(isRecording, hasError = false) {
    const status = isRecording ? 'Recording in progress' : 'Not recording';
    const errorInfo = hasError ? `\nFailed chunks: ${failedChunks.length}` : '';
    chunkInfo.innerHTML = `<p>${status}${errorInfo}</p>`;
}

function updateUI(isRecording) {
    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    statusIndicator.className = `status-indicator ${isRecording ? 'status-recording' : 'status-stopped'}`;
    statusText.textContent = isRecording ? 'Recording' : 'Not Recording';
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        updateUI(false);
        updateChunkInfo(false);
        
        // Stop all tracks in the stream
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
} 