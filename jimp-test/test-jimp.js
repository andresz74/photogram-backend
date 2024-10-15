const Jimp = require('jimp');

(async () => {
    try {
        const image = await Jimp.read('./sample-image.jpg');  // Use a valid image path
        console.log('Image processed:', image);
    } catch (error) {
        console.error('Error reading image:', error);
    }
})();
