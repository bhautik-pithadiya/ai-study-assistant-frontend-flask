from flask import Flask, render_template, request, jsonify
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

API_BASE_URL = "http://35.225.50.125:8000"

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
        if not image_data:
            logger.error('No image data provided in request')
            return jsonify({'error': 'No image data provided'}), 400

        # Remove the data URL prefix if present
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        # Decode base64 image
        image_bytes = base64.b64decode(image_data)
        logger.info('Successfully decoded base64 image')
        
        # Send to OCR endpoint
        files = {'file': ('image.jpg', image_bytes, 'image/jpeg')}
        logger.info('Sending image to OCR endpoint')
        ocr_response = requests.post(f"{API_BASE_URL}/upload_image/", files=files)
        
        if ocr_response.status_code != 200:
            logger.error(f'OCR processing failed with status code: {ocr_response.status_code}')
            return jsonify({'error': 'OCR processing failed'}), 500

        ocr_text = ocr_response.json().get('ocr_text', '')
        logger.info(f'OCR text extracted: {ocr_text[:100]}...')
        
        # Send to answer endpoint
        logger.info('Sending OCR text to answer endpoint')
        answer_response = requests.post(f"{API_BASE_URL}/answer_mcq/{ocr_text}")
        
        if answer_response.status_code != 200:
            logger.error(f'Answer processing failed with status code: {answer_response.status_code}')
            return jsonify({'error': 'Answer processing failed'}), 500

        answer = answer_response.json().get('answer', '')
        logger.info(f'Answer received: {answer[:100]}...')
        
        return jsonify({
            'ocr_text': ocr_text,
            'answer': answer
        })

    except Exception as e:
        logger.error(f'Error processing request: {str(e)}', exc_info=True)
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info('Starting Flask application')
    app.run(debug=True) 