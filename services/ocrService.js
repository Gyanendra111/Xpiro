const Tesseract = require('tesseract.js');

const ocrService = {
    recognize: async (image) => {
        return await Tesseract.recognize(image, 'eng');
    }
};

module.exports = ocrService;