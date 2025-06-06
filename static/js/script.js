let ws;
let audioContext;
let isRecording = false;
let pcmNode;
let stream;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const chunkInfo = document.getElementById('chunkInfo');
const transcriptContainer = document.getElementById('transcriptContainer');

const backend_url = "ws://localhost:8000";  // Ensure WS path

function connectWebSocket() {
    const wsUrl = `${backend_url}/api/v1/transcribe_ws/stream`;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => console.log("✅ WebSocket connected.");
    ws.onmessage = (event) => displayTranscript(JSON.parse(event.data));
    ws.onclose = (event) => {
        console.log("🔌 WebSocket disconnected.", event);
        if (event) {
            console.log(`WebSocket closed: code=${event.code}, reason=${event.reason}, wasClean=${event.wasClean}`);
        }
        stopRecording();
    };
    ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        stopRecording();
    };
}

function displayTranscript(data) {
    const { transcript, confidence, is_final } = data;

    // Only display if confidence is greater than zero
    if (!confidence || confidence === 0) return;

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

let pcmBuffer = [];
const PCM_CHUNK_SIZE = 48000; // 1 second at 48kHz

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }

        await waitForSocketConnection();

        audioContext = new AudioContext({ sampleRate: 48000 });
        await audioContext.audioWorklet.addModule('static/js/pcm_processor.js');
        pcmNode = new AudioWorkletNode(audioContext, 'pcm-processor');

        pcmNode.port.onmessage = (event) => {
            const chunk = new Int16Array(event.data);
            pcmBuffer.push(...chunk);

            // If we've collected 1 second of audio, send it
            while (pcmBuffer.length >= PCM_CHUNK_SIZE) {
                const oneSecChunk = pcmBuffer.slice(0, PCM_CHUNK_SIZE);
                pcmBuffer = pcmBuffer.slice(PCM_CHUNK_SIZE);

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(Int16Array.from(oneSecChunk).buffer);
                    updateChunkInfo(oneSecChunk.length * 2); // 2 bytes per sample
                }
            }
        };

        const source = audioContext.createMediaStreamSource(stream);
        source.connect(pcmNode);

        isRecording = true;

        // UI Update
        startBtn.disabled = true;
        stopBtn.disabled = false;
        statusIndicator.className = 'status-indicator status-recording';
        statusText.textContent = 'Recording...';
        transcriptContainer.innerHTML = '';
    } catch (error) {
        console.error("🎤 Microphone access error:", error);
        alert("Failed to access microphone.");
    }
}

function stopRecording() {
    if (isRecording) {
        isRecording = false;
        if (pcmNode) pcmNode.disconnect();
        if (audioContext) audioContext.close();
        if (stream) stream.getTracks().forEach(t => t.stop());

        // Send any remaining buffered audio
        if (pcmBuffer.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(Int16Array.from(pcmBuffer).buffer);
            updateChunkInfo(pcmBuffer.length * 2);
            pcmBuffer = [];
        }

        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusIndicator.className = 'status-indicator status-stopped';
        statusText.textContent = 'Not Recording';
        chunkInfo.innerHTML = '<p>No recording in progress</p>';

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    }
}

function waitForSocketConnection() {
    return new Promise(resolve => {
        if (ws.readyState === WebSocket.OPEN) return resolve();
        ws.addEventListener("open", resolve);
    });
}

function updateChunkInfo(length) {
    const kbSize = (length / 1024).toFixed(2);
    chunkInfo.innerHTML = `
        <p>Last PCM chunk: ${kbSize} KB</p>
        <p>Status: Recording</p>
    `;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
window.addEventListener('beforeunload', stopRecording);
