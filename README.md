# Image Upload and Management Service

This service provides a backend API for handling image uploads, compression, and deletion using **Firebase Storage** and **Sharp** for image processing. It also supports **CORS** for interaction with a frontend.

## Features

- Upload and compress images using `Sharp`
- Store images in Firebase Storage
- Delete images from Firebase Storage
- Enable CORS to allow communication with a frontend app

## Prerequisites

To run this service, you will need the following:

- **Node.js** (version 18 or higher)
- **Firebase Admin SDK** setup
- **Firebase Storage** bucket

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/andresz74/photogram-backend.git
cd photogram-backend
```

### 2. Install Dependencies

Run the following command to install all necessary dependencies:

```bash
npm install
```

### 3. Firebase Admin SDK Setup

Make sure you have a Firebase project and a storage bucket set up. Create a service account in Firebase and download the credentials as a `.json` file. Place this file in your project directory.

Update the Firebase Admin SDK initialization in `index.js` to use your service account file:

```javascript
const serviceAccount = require('./path-to-your-service-account.json');
```

### 4. Environment Variables

You need to specify the Firebase storage bucket in your service. In the `index.js` file, make sure you update the bucket name accordingly:

```javascript
storageBucket: 'your-firebase-storage-bucket'
```

### 5. Running the Server

Start the server by running:

```bash
npm start
```

This will start the backend server on port `3003` by default.

## API Endpoints

### 1. Upload an Image

**Endpoint:**

```
POST /api/upload
```

**Description:**

This endpoint accepts an image file and uploads it to Firebase Storage after compressing it using Sharp.

**Request:**

- **Headers:**
  - `Content-Type: multipart/form-data`
- **Body:**
  - `image`: The image file to upload (sent as `multipart/form-data`).

**Response:**

- **200 OK:** If the upload is successful, the response will include the public URL of the uploaded image:
  ```json
  {
    "url": "https://storage.googleapis.com/your-bucket-name/images/1234567890-image.jpg"
  }
  ```
- **500 Internal Server Error:** If an error occurs during the upload.

### 2. Delete an Image

**Endpoint:**

```
POST /api/delete-image
```

**Description:**

This endpoint deletes an image from Firebase Storage.

**Request:**

- **Headers:**
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "imgName": "image.jpg"
  }
  ```

**Response:**

- **200 OK:** If the deletion is successful.
  ```text
  File successfully deleted
  ```
- **400 Bad Request:** If the `imgName` is not provided.
- **500 Internal Server Error:** If an error occurs during the deletion.

## CORS

The service allows CORS requests from your frontend, which is specified in the CORS configuration. If your frontend is running on a different port, update the `origin` in the `CORS` middleware setup in `index.js`:

```javascript
app.use(cors({
    origin: 'http://your-frontend-url', // Update this to your frontend's URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
```

## File Upload Size Limits

By default, this service uses **Multer** with in-memory storage to handle file uploads. You can configure limits like file size in the `Multer` middleware:

```javascript
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }  // Limit to 5MB
});
```

## Running on a Different Port

To change the port on which the server runs, update the port number in the `app.listen()` method:

```javascript
app.listen(3003, () => {
    console.log('Server is running on port 3003');
});
```

## License

This project is licensed under the MIT License.