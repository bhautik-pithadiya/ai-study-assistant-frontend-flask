// Revised WebSocket-based Audio Recorder (5-second chunking)
let ws;
let audioContext;
let mediaRecorder;
let stream;
let isRecording = false;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const chunkInfo = document.getElementById('chunkInfo');
const transcriptContainer = document.getElementById('transcriptContainer');

const backend_url = "ws://localhost:8000";

function connectWebSocket() {
    const wsUrl = `${backend_url}/api/v1/transcribe_ws/stream`;
    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => console.log("✅ WebSocket connected.");

    ws.onmessage = (event) => displayTranscript(JSON.parse(event.data));

    ws.onclose = () => {
        console.log("🔌 WebSocket disconnected.");
        stopRecording();
    };

    ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        stopRecording();
    };
}

function displayTranscript({ transcript, confidence, is_final }) {
    const transcriptItem = document.createElement('div');
    transcriptItem.className = 'transcript-item';

    const confidenceClass = confidence > 0.8 ? 'confidence-high' :
                            confidence > 0.5 ? 'confidence-medium' : 'confidence-low';

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

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connectWebSocket();
        }

        await new Promise(resolve => {
            if (ws.readyState === WebSocket.OPEN) resolve();
            else ws.addEventListener("open", resolve);
        });

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                event.data.arrayBuffer().then(buffer => {
                    ws.send(buffer);
                    updateChunkInfo((buffer.byteLength / 1024).toFixed(2));
                });
            }
        };

        mediaRecorder.start(5000); // chunk every 5 seconds

        isRecording = true;
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
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();

        startBtn.disabled = false;
        stopBtn.disabled = true;
        statusIndicator.className = 'status-indicator status-stopped';
        statusText.textContent = 'Not Recording';
        chunkInfo.innerHTML = '<p>No recording in progress</p>';
    }
}

function updateChunkInfo(kbSize) {
    chunkInfo.innerHTML = `
        <p>Last PCM chunk: ${kbSize} KB</p>
        <p>Status: Recording</p>
    `;
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
window.addEventListener('beforeunload', stopRecording);
