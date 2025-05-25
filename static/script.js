document.addEventListener('DOMContentLoaded', function() {
    // Logging utility
    const logger = {
        info: (message) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`),
        error: (message, error) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error),
        warn: (message) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`)
    };

    logger.info('Application initialized');

    // Camera and Chat functionality (Combined)
    const video = document.getElementById('camera');
    const canvas = document.getElementById('canvas');
    const cameraBtn = document.getElementById('cameraBtn'); // Re-define cameraBtn for the new UI
    const sendBtn = document.getElementById('sendBtn'); // Re-define sendBtn for the new UI
    const chatInput = document.getElementById('chatInput'); // Re-define chatInput for the new UI
    const preview = document.getElementById('preview');
    const chatMessages = document.getElementById('chatMessages');
    const cameraPreviewArea = document.getElementById('cameraPreviewArea');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const answer = document.getElementById('answer'); // Answer display integrated into messages
    const switchCameraBtn = document.getElementById('switchCameraBtn'); // Keep switch camera if needed

    let stream = null;
    let capturedImage = null;
    let availableCameraDevices = [];
    let currentCameraIndex = 0;
    let currentFacingMode = 'user'; // Default to front camera

    // Function to add messages to the chat window
    function addMessage(text, isUser = false, isImage = false, imageUrl = null) {
        logger.info(`Adding ${isUser ? 'user' : 'bot'} message: ${text ? text.substring(0, 50) : 'Image'}...`);
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;

        if (isImage && imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            messageDiv.appendChild(img);
            if (text) {
                 const textNode = document.createElement('div');
                 textNode.textContent = text;
                 messageDiv.appendChild(textNode);
            }
        } else {
            messageDiv.textContent = text;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

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

            // Show video feed in the preview area
            video.style.display = 'block';
            preview.innerHTML = ''; // Clear any previous preview
            preview.appendChild(video);
            cameraPreviewArea.style.display = 'block';
            removeImageBtn.style.display = 'none'; // Hide remove button initially

        } catch (err) {
            logger.error('Error accessing camera', err);
            if (err.name === 'NotAllowedError') {
                alert('Camera access was denied. Please allow camera access.');
            } else if (err.name === 'NotFoundError') {
                alert('No camera found. Please connect a camera.');
            } else if (err.name === 'NotReadableError') {
                alert('Camera is in use by another application.');
            } else {
                alert('Error accessing camera: ' + err.message);
            }
            
            // Attempt to switch facing mode if the current one failed
            if (facingMode && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
                logger.warn(`Attempting to switch facing mode after error: ${err.name}`);
                const nextFacingMode = facingMode === 'user' ? 'environment' : 'user';
                startCamera(null, nextFacingMode);
            }
             cameraPreviewArea.style.display = 'none'; // Hide area if camera fails
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

            // Try to start with the environment-facing camera if available
            const environmentCamera = availableCameraDevices.find(device => 
                device.label.toLowerCase().includes('back') || 
                device.label.toLowerCase().includes('environment'));
            const userCamera = availableCameraDevices.find(device => 
                device.label.toLowerCase().includes('front') || 
                device.label.toLowerCase().includes('user'));

            // Changed priority: try environment camera first
            if (environmentCamera) {
                currentCameraIndex = availableCameraDevices.indexOf(environmentCamera);
                await startCamera(environmentCamera.deviceId, 'environment');
            } else if (userCamera) {
                currentCameraIndex = availableCameraDevices.indexOf(userCamera);
                await startCamera(userCamera.deviceId, 'user');
            } else if (availableCameraDevices.length > 0) {
                currentCameraIndex = 0;
                await startCamera(availableCameraDevices[currentCameraIndex].deviceId);
            } else {
                await startCamera(null, 'environment'); // Changed default to environment
            }

        } catch (err) {
            logger.error('Error enumerating devices or starting default camera', err);
            switchCameraBtn.style.display = 'none';
            if (err.name === 'NotAllowedError') {
                alert('Camera access was denied. Please allow camera access.');
            } else if (err.name === 'NotFoundError') {
                alert('No camera found. Please connect a camera.');
            } else {
                alert('Error accessing camera: ' + err.message);
            }
        }
    }

    // Initialize camera when the camera button is clicked
    cameraBtn.addEventListener('click', () => {
        logger.info('Camera button clicked. Detecting and starting cameras.');
        detectCameras();
    });

    // Capture image from video feed
    function captureImage() {
        logger.info('Capturing image');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        
        // Stop the video stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Hide video and show captured image in the preview area
        video.style.display = 'none';
        const img = document.createElement('img');
        img.src = canvas.toDataURL('image/jpeg');
        img.style.display = 'block';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        preview.innerHTML = '';
        preview.appendChild(img);
        capturedImage = img;

        cameraPreviewArea.style.display = 'block'; // Ensure preview area is visible
        removeImageBtn.style.display = 'inline-block'; // Show remove button

        logger.info('Image captured and displayed in preview');
    }

    // Add click listener to the video feed to trigger capture
    video.addEventListener('click', captureImage);

    // Remove captured image
    removeImageBtn.addEventListener('click', () => {
        logger.info('Removing captured image');
        preview.innerHTML = '';
        capturedImage = null;
        cameraPreviewArea.style.display = 'none';
        removeImageBtn.style.display = 'none';
        // Optionally restart camera or just clear preview
        // startCamera(); // Uncomment to restart camera after removing image
    });

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

    // Send message (text + optional image)
    async function sendMessage() {
        const text = chatInput.value.trim();
        const imageData = capturedImage ? capturedImage.src.split(',')[1] : null; // Get base64 data if image exists

        if (!text && !imageData) {
            logger.warn('Send button clicked with no text and no image.');
            return; // Don't send if both are empty
        }

        logger.info(`Sending message: ${text ? text.substring(0, 50) : 'No text'}..., Image: ${imageData ? 'Yes' : 'No'}`);

        // Add user message with image to chat window immediately
        addMessage(text, true, capturedImage ? true : false, capturedImage ? capturedImage.src : null);

        // Clear input and preview after sending
        chatInput.value = '';
        preview.innerHTML = '';
        capturedImage = null;
        cameraPreviewArea.style.display = 'none';
        removeImageBtn.style.display = 'none';
         if (stream) { // Stop camera stream if active after sending
            stream.getTracks().forEach(track => track.stop());
        }

        try {
            const response = await fetch('/upload_image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image: imageData ? `data:image/jpeg;base64,${imageData}` : null,
                    text: text
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            // Add bot answer to chat window
            addMessage(data.answer);
            logger.info('Message sent and response received successfully');
        } catch (error) {
            logger.error('Error sending message', error);
            addMessage('Error: ' + error.message); // Display error in chat window
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Adjust chat input height automatically
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });

    // Initial height adjustment
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
});