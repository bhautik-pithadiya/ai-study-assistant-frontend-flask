let mediaRecorder;
let ws;
let isRecording = false;
let audioChunks = [];
let chunkCounter = 0;
let failedChunks = [];

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const chunkInfo = document.getElementById('chunkInfo');
const transcriptContainer = document.getElementById('transcriptContainer');

const backend_url = "http://localhost:8000"
// WebSocket connection setup
function connectWebSocket() {
    // const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${backend_url}/api/v1/transcribe_ws/stream`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        displayTranscript(data);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (isRecording) {
            stopRecording();
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        stopRecording();
    };
}

// Display transcript with confidence level
function displayTranscript(data) {
    const { transcript, confidence, is_final } = data;
    
    const transcriptItem = document.createElement('div');
    transcriptItem.className = 'transcript-item';
    
    const confidenceClass = confidence > 0.8 ? 'confidence-high' : 
                           confidence > 0.5 ? 'confidence-medium' : 
                           'confidence-low';
    
    transcriptItem.innerHTML = `
        <span>${transcript}</span>
        <span class="confidence-badge ${confidenceClass}">
            ${Math.round(confidence * 100)}%
        </span>
        ${is_final ? '<span class="badge bg-success ms-2">Final</span>' : ''}
    `;
    
    transcriptContainer.appendChild(transcriptItem);
    transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
}

// Start recording
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'audio/webm;codecs=opus'
        });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                ws.send(event.data);
                updateChunkInfo(event.data.size);
            }
        };
        
        mediaRecorder.start(100); // Send chunks every 100ms
        isRecording = true;
        
        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusIndicator.className = 'status-indicator status-recording';
        statusText.textContent = 'Recording...';
        transcriptContainer.innerHTML = '';
        
        // Connect WebSocket if not already connected
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
    }
}

// Stop recording
function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        isRecording = false;
        
        // Update UI
        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusIndicator.className = 'status-indicator status-stopped';
        statusText.textContent = 'Not Recording';
        chunkInfo.innerHTML = '<p>No recording in progress</p>';
        
        // Close WebSocket
        if (ws) {
            ws.close();
        }
    }
}

// Update chunk information
function updateChunkInfo(size) {
    const sizeKB = (size / 1024).toFixed(2);
    chunkInfo.innerHTML = `
        <p>Last chunk size: ${sizeKB} KB</p>
        <p>Status: Recording in progress</p>
    `;
}

// Event listeners
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (isRecording) {
        stopRecording();
    }
}); 