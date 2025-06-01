from flask import Flask, render_template, request, jsonify, redirect, url_for, session
from flask_cors import CORS
import requests
import os
from PIL import Image
import io
import base64
import logging
from datetime import datetime
from functools import wraps

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # Enable CORS for all routes
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')  # Change this in production!

# Change the API_BASE_URL to be configurable
API_BASE_URL = os.getenv('API_BASE_URL', 'http://127.0.0.1:8000')

# Audio chunk size configuration (in seconds)
CHUNK_SIZES = {
    'small': 1,    # 1 second chunks
    'medium': 2,   # 2 second chunks
    'large': 3,    # 3 second chunks
    'xlarge': 4    # 4 second chunks
}

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # TODO: Replace this with actual user authentication
        if username == 'admin' and password == 'password':
            session['user'] = username
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error='Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    logger.info('Homepage accessed')
    return render_template('index.html')

@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        logger.info('Received image upload request')
        
        # Get the image data from the request
        image_data = request.json.get('image')
        # Get the optional text data from the request
        optional_text = request.json.get('text', '') # Get optional text, default to empty string
        
        if not image_data:
            logger.error('No image data provided in request')
            return jsonify({'error': 'No image data provided'}), 400

        # Remove the data URL prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        logger.info('Successfully decoded base64 image')
        
        # Prepare data for the new multimodel endpoint
        files = {'file': ('image.jpg', image_bytes, 'image/jpeg')}
        data = {'text': optional_text}

        # Send to the new multimodel answer endpoint
        logger.info('Sending image and text to /api/v1/answer/ endpoint')
        answer_response = requests.post(f"{API_BASE_URL}/api/v1/answer/", files=files, data=data)
        
        if answer_response.status_code != 200:
            logger.error(f'Answer processing failed with status code: {answer_response.status_code}')
            return jsonify({'error': 'Answer processing failed'}), 500

        # Extract the answer from the response
        answer = answer_response.json().get('answer', '')
        logger.info(f'Answer received: {answer[:100]}...')
        
        # The new endpoint only returns the answer, so we return just that.
        return jsonify({
            'answer': answer
        })

    except Exception as e:
        logger.error(f'Error processing request: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

@app.route('/recording')
@login_required
def recording():
    return render_template('transcription.html')

@app.route('/transcribe', methods=['POST'])
@login_required
def transcribe():
    try:
        data = request.json
        if not data or 'audio' not in data:
            logger.error('No audio data provided in request')
            return jsonify({'error': 'No audio data provided'}), 400

        # Get chunk size from request or use default
        chunk_size = data.get('chunk_size', CHUNK_SIZES['medium'])
        chunk_index = data.get('chunk_index', 0)
        audio_mime_type = data.get('audio_mime_type', 'audio/webm;codecs=opus')
        
        # Log chunk information
        logger.info(f'Processing chunk {chunk_index} with size {chunk_size}s')
        
        # Decode base64 audio
        # try:
        #     audio_bytes = base64.b64decode(data['audio'])
        #     logger.info(f'Successfully decoded audio chunk {chunk_index} (size: {len(audio_bytes)} bytes)')
        # except Exception as e:
        #     logger.error(f'Error decoding audio chunk {chunk_index}: {str(e)}')
        #     return jsonify({'error': 'Invalid audio data format'}), 400

        audio_data = data['audio']
        # Prepare request for FastAPI endpoint
        transcribe_request = {
            'audio_content': audio_data,  # Convert bytes to hex string for JSON
            'audio_mime_type': audio_mime_type
        }

        # Send to FastAPI endpoint
        try:
            logger.info(f'Sending chunk {chunk_index} to transcription service')
            response = requests.post(
                f"{API_BASE_URL}/api/v1/transcribe/transcribe",
                json=transcribe_request
            )
            response.raise_for_status()
            
            result = response.json()
            logger.info(f'Successfully transcribed chunk {chunk_index}: {result}')
            
            return jsonify({
                'status': 'success',
                'chunk_index': chunk_index,
                'chunk_size': chunk_size,
                'transcript': result.get('transcript', ''),
                'confidence': result.get('confidence', 0.0)
            })

        except requests.exceptions.RequestException as e:
            logger.error(f'Error calling transcription service for chunk {chunk_index}: {str(e)}')
            if hasattr(e.response, 'text'):
                logger.error(f'Response text: {e.response.text}')
            return jsonify({'error': 'Transcription service error'}), 500

    except Exception as e:
        logger.error(f'Error in transcription: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    logger.info('Starting Flask application')
    # app.run(ssl_context=('cert.pem', 'key.pem'), host='0.0.0.0', port=8443)
    app.run(host="127.0.0.1", port=5000, debug=True)

