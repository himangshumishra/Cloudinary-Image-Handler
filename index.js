import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure environment variables
dotenv.config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    }
});

// Ensure the temp directory exists
const tempDir = path.join('/tmp', 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Cloudinary upload function
const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        // Upload the file on cloudinary
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        // File has been uploaded successfully
        console.log("File is uploaded on cloudinary", response.url);

        // Remove the locally saved temporary file
        fs.unlinkSync(localFilePath);

        return response;
    } catch (error) {
        console.error('Error uploading file:', error);
        // Remove the locally saved temporary file as the upload operation failed
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }
        return null;
    }
};

// Temporary file handling function
const saveBufferToTemp = async (buffer, originalname) => {
    const tempPath = path.join(tempDir, `temp_${Date.now()}_${originalname}`);
    await fs.promises.writeFile(tempPath, buffer);
    return tempPath;
};

// Upload endpoint
app.post('/api/upload', upload.array('images', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files were uploaded."
            });
        }

        const uploadPromises = req.files.map(async (file) => {
            try {
                // Save buffer to temporary file
                const tempPath = await saveBufferToTemp(file.buffer, file.originalname);

                // Upload to Cloudinary
                const cloudinaryResponse = await uploadOnCloudinary(tempPath);

                if (!cloudinaryResponse) {
                    throw new Error('Cloudinary upload failed');
                }

                return {
                    originalname: file.originalname,
                    cloudinaryUrl: cloudinaryResponse.url,
                    publicId: cloudinaryResponse.public_id,
                    secureUrl: cloudinaryResponse.secure_url
                };
            } catch (error) {
                return {
                    originalname: file.originalname,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(uploadPromises);

        const successful = results.filter(result => !result.error);
        const failed = results.filter(result => result.error);

        return res.status(200).json({
            success: true,
            message: "Upload processed",
            data: {
                successful,
                failed,
                totalProcessed: results.length,
                successfulUploads: successful.length,
                failedUploads: failed.length
            }
        });

    } catch (error) {
        console.error('Upload error:', error);
        return res.status(500).json({
            success: false,
            message: "Error processing upload",
            error: error.message
        });
    }
});

// Test endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: "Server is running"
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
    });
});

// Export the Express app for Vercel
export default app;