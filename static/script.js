document.addEventListener('DOMContentLoaded', function() {
    // Logging utility
    const logger = {
        info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
        error: (message, error) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error),
        warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
    };

    logger.info('Application initialized');

    // Toggle between camera and chat sections
    const cameraBtn = document.getElementById('cameraBtn');
    const chatBtn = document.getElementById('chatBtn');
    const cameraSection = document.getElementById('cameraSection');
    const chatSection = document.getElementById('chatSection');

    cameraBtn.addEventListener('click', () => {
        logger.info('Switching to camera mode');
        cameraSection.classList.add('active');
        chatSection.classList.remove('active');
        cameraBtn.classList.add('btn-primary');
        cameraBtn.classList.remove('btn-secondary');
        chatBtn.classList.add('btn-secondary');
        chatBtn.classList.remove('btn-primary');
        // Initialize camera when switching to camera mode
        detectCameras();
    });

    chatBtn.addEventListener('click', () => {
        logger.info('Switching to chat mode');
        chatSection.classList.add('active');
        cameraSection.classList.remove('active');
        chatBtn.classList.add('btn-primary');
        chatBtn.classList.remove('btn-secondary');
        cameraBtn.classList.add('btn-secondary');
        cameraBtn.classList.remove('btn-primary');
    });

    // Camera functionality
    const video = document.getElementById('camera');
    const canvas = document.getElementById('canvas');
    const captureBtn = document.getElementById('captureBtn');
    const retakeBtn = document.getElementById('retakeBtn');
    const processBtn = document.getElementById('processBtn');
    const preview = document.getElementById('preview');
    const ocrText = document.getElementById('ocrText');
    const answer = document.getElementById('answer');
    const switchCameraBtn = document.getElementById('switchCameraBtn');

    let stream = null;
    let capturedImage = null;
    let availableCameraDevices = [];
    let currentCameraIndex = 0;
    let currentFacingMode = 'user'; // Default to front camera

    // Start camera
    async function startCamera(deviceId, facingMode) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        try {
            logger.info(`Requesting camera access with deviceId: ${deviceId}, facingMode: ${facingMode}`);
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: facingMode || 'user'
                }
            };

            if (deviceId) {
                constraints.video.deviceId = { exact: deviceId };
            }

            stream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    video.play()
                        .then(() => {
                            logger.info('Video started playing');
                            resolve();
                        })
                        .catch(err => {
                            logger.error('Error playing video', err);
                            resolve(); // Resolve anyway to continue
                        });
                };
            });

            logger.info('Camera access granted');

            // Update current facing mode based on the active track settings
            const settings = stream.getVideoTracks()[0].getSettings();
            currentFacingMode = settings.facingMode || currentFacingMode;
            logger.info(`Active camera facing mode: ${currentFacingMode}`);

        } catch (err) {
            logger.error('Error accessing camera', err);
            if (err.name === 'NotAllowedError') {
                alert('Camera access was denied. Please allow camera access and refresh the page.');
            } else if (err.name === 'NotFoundError') {
                alert('No camera found. Please connect a camera and refresh the page.');
            } else if (err.name === 'NotReadableError') {
                alert('Camera is in use by another application. Please close other applications using the camera and refresh the page.');
            } else {
                alert('Error accessing camera: ' + err.message + '. Please refresh the page and try again.');
            }
            
            // Attempt to switch facing mode if the current one failed
            if (facingMode && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
                logger.warn(`Attempting to switch facing mode after error: ${err.name}`);
                const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
                startCamera(null, nextFacingMode);
            }
        }
    }

    // Detect available cameras and show switch button if needed
    async function detectCameras() {
        try {
            // Request permission first with a broad constraint
            await navigator.mediaDevices.getUserMedia({ 
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            const devices = await navigator.mediaDevices.enumerateDevices();
            availableCameraDevices = devices.filter(device => device.kind === 'videoinput');

            if (availableCameraDevices.length > 1) {
                switchCameraBtn.style.display = 'inline-block';
            } else {
                switchCameraBtn.style.display = 'none';
            }

            // Try to start with the user-facing camera if available, otherwise the first device
            const userCamera = availableCameraDevices.find(device => 
                device.label.toLowerCase().includes('front') || 
                device.label.toLowerCase().includes('user'));
            const environmentCamera = availableCameraDevices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('environment'));

            if (userCamera) {
                currentCameraIndex = availableCameraDevices.indexOf(userCamera);
                await startCamera(userCamera.deviceId, 'user');
            } else if (environmentCamera) {
                currentCameraIndex = availableCameraDevices.indexOf(environmentCamera);
                await startCamera(environmentCamera.deviceId, 'environment');
            } else if (availableCameraDevices.length > 0) {
                currentCameraIndex = 0;
                await startCamera(availableCameraDevices[currentCameraIndex].deviceId);
            } else {
                await startCamera(null, 'user');
            }

        } catch (err) {
            logger.error('Error enumerating devices or starting default camera', err);
            switchCameraBtn.style.display = 'none';
            if (err.name === 'NotAllowedError') {
                alert('Camera access was denied. Please allow camera access and refresh the page.');
            } else if (err.name === 'NotFoundError') {
                alert('No camera found. Please connect a camera and refresh the page.');
            } else {
                alert('Error accessing camera: ' + err.message + '. Please refresh the page and try again.');
            }
        }
    }

    // Initialize camera when the page loads
    detectCameras();

    // Modify switch camera button logic to cycle through devices AND try toggling facing mode
    switchCameraBtn.addEventListener('click', () => {
        if (availableCameraDevices.length <= 1) return;

        // Determine the next device index
        currentCameraIndex = (currentCameraIndex + 1) % availableCameraDevices.length;
        const nextCamera = availableCameraDevices[currentCameraIndex];

        // Attempt to start the camera with facing mode if suggested by label, otherwise use deviceId
        let preferredFacingMode = undefined;
        const label = nextCamera.label.toLowerCase();
        if (label.includes('front') || label.includes('user')) {
            preferredFacingMode = 'user';
        } else if (label.includes('back') || label.includes('environment')) {
            preferredFacingMode = 'environment';
        }

        logger.info(`Attempting to switch to camera: ${nextCamera.label || nextCamera.deviceId} with preferred facing mode: ${preferredFacingMode}`);
        startCamera(nextCamera.deviceId, preferredFacingMode);
    });

    // Capture image
    captureBtn.addEventListener('click', () => {
        logger.info('Capturing image');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        // Stop the video stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Hide video and show captured image
        video.style.display = 'none';
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/jpeg');
        img.style.display = 'block';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        preview.innerHTML = '';
        preview.appendChild(img);
        capturedImage = img;

        captureBtn.style.display = 'none';
        retakeBtn.style.display = 'inline-block';
        processBtn.style.display = 'inline-block';
        logger.info('Image captured and displayed');
    });

    // Retake photo
    retakeBtn.addEventListener('click', () => {
        logger.info('Retaking photo');
        preview.innerHTML = '';
        video.style.display = 'block';
        captureBtn.style.display = 'inline-block';
        retakeBtn.style.display = 'none';
        processBtn.style.display = 'none';
        ocrText.textContent = '';
        answer.textContent = '';
        capturedImage = null;
        
        // Restart camera
        startCamera();
    });

    // Process image
    processBtn.addEventListener('click', async () => {
        if (!capturedImage) return;
        
        logger.info('Processing image');
        const imageData = capturedImage.src;
        
        try {
            logger.info('Sending image to server');
            const response = await fetch('/upload_image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });

            const data = await response.json();
            
            if (response.ok) {
                logger.info('Image processed successfully');
                ocrText.textContent = data.ocr_text;
                answer.textContent = data.answer;
            } else {
                logger.error('Error processing image', data.error);
                alert('Error processing image: ' + data.error);
            }
        } catch (err) {
            logger.error('Error processing image', err);
            alert('Error processing image. Please try again.');
        }
    });

    // Chat functionality
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');

    function addMessage(text, isUser = false) {
        logger.info(`Adding ${isUser ? 'user' : 'bot'} message: ${text.substring(0, 50)}...`);
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
        messageDiv.textContent = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        logger.info(`Sending message: ${message}`);
        addMessage(message, true);
        chatInput.value = '';

        try {
            logger.info('Sending message to server');
            const response = await fetch('/answer_mcq/' + encodeURIComponent(message), {
                method: 'POST'
            });

            const data = await response.json();
            
            if (response.ok) {
                logger.info('Received answer from server');
                addMessage(data.answer);
            } else {
                logger.error('Error from server', data.error);
                addMessage('Error: ' + data.error);
            }
        } catch (err) {
            logger.error('Error sending message', err);
            addMessage('Error sending message. Please try again.');
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
});