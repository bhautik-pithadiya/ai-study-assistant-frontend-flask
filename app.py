from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import requests
import os
from PIL import Image
import io
import base64
import logging
from datetime import datetime

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

# Change the API_BASE_URL to be configurable
API_BASE_URL = os.getenv('API_BASE_URL', 'http://35.223.82.215:8000')

@app.route('/')
def index():
    logger.info('Homepage accessed')
    return render_template('index.html')

@app.route('/upload_image', methods=['POST'])
def upload_image():
    try:
        logger.info('Received image upload request')
        
        # Get the image data from the request
        image_data = request.json.get('image')
        # Get optional text data from the request
        optional_text = request.json.get('text')

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
        data = {}
        if optional_text:
            data['text'] = optional_text

        # Send to the new multimodel answer endpoint
        logger.info('Sending image and optional text to /api/v1/answer/ endpoint')
        answer_response = requests.post(f"{API_BASE_URL}/api/v1/answer/", files=files, data=data)
        
        if answer_response.status_code != 200:
            logger.error(f'Answer processing failed with status code: {answer_response.status_code}')
            return jsonify({'error': 'Answer processing failed'}), 500

        answer = answer_response.json().get('answer', '')
        logger.info(f'Answer received: {answer[:100]}...')
        
        return jsonify({
            'answer': answer
        })

    except Exception as e:
        logger.error(f'Error processing request: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

  
if __name__ == "__main__":
    logger.info('Starting Flask application')
    # app.run(ssl_context=('cert.pem', 'key.pem'), host='0.0.0.0', port=8443)
    app.run(host="127.0.0.1", port=5000)

