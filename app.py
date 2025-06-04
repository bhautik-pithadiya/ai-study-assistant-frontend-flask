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
        
        # Ensure the request contains JSON
        if not request.is_json:
            logger.error('Request content-type is not application/json')
            return jsonify({'error': 'Content-Type must be application/json'}), 400

        req_json = request.get_json()
        if not req_json:
            logger.error('No JSON body found in request')
            return jsonify({'error': 'No JSON body found'}), 400

        # Get the image data from the request
        image_data = req_json.get('image')
        # Get the optional text data from the request
        optional_text = req_json.get('text', '') # Get optional text, default to empty string
        
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
            return jsonify({'error': 'No audio data provided'}), 400

        chunk_size = data.get('chunk_size', CHUNK_SIZES['medium'])
        chunk_index = data.get('chunk_index', 0)
        audio_mime_type = data.get('audio_mime_type', 'audio/webm;codecs=opus')

        # Decode audio from base64
        try:
            audio_bytes = base64.b64decode(data['audio'])
        except Exception as e:
            return jsonify({'error': 'Invalid base64 audio'}), 400

        # Prepare request to FastAPI
        transcribe_request = {
            'audio_content': audio_bytes.decode('latin1'),
            'audio_mime_type': audio_mime_type
        }

        try:
            response = requests.post(
                f"{API_BASE_URL}/api/v1/transcribe/transcribe",
                json=transcribe_request
            )
            response.raise_for_status()
            result = response.json()
            return jsonify({
                'status': 'success',
                'chunk_index': chunk_index,
                'chunk_size': chunk_size,
                'transcript': result.get('transcript', ''),
                'confidence': result.get('confidence', 0.0)
            })
        except requests.exceptions.RequestException as e:
            return jsonify({'error': 'Transcription service error'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    logger.info('Starting Flask application')
    # app.run(ssl_context=('cert.pem', 'key.pem'), host='0.0.0.0', port=8443)
    app.run(host="127.0.0.1", port=5000, debug=True)

