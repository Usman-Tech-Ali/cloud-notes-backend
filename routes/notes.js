const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { uploadToS3, deleteFromS3 } = require('../config/s3');
const multer = require('multer');

// Configure multer for memory storage (for S3 upload)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Get all notes for authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, image_url, created_at, updated_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.userId]
    );

    res.json({ notes: result.rows });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single note
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, image_url, created_at, updated_at FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    res.json({ note: result.rows[0] });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create note
router.post('/',
  authenticateToken,
  upload.single('image'),
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').trim().optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, content } = req.body;
      let imageUrl = null;

      // Upload image to S3 if provided
      if (req.file) {
        try {
          const uploadResult = await uploadToS3(req.file, 'notes');
          imageUrl = uploadResult.url;
        } catch (error) {
          // For local development: allow note creation without image if S3 is not configured
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  S3 upload failed (AWS credentials may not be configured). Creating note without image.');
            imageUrl = null;
          } else {
            return res.status(500).json({ message: 'Failed to upload image. Please check AWS S3 configuration.' });
          }
        }
      }

      const result = await pool.query(
        'INSERT INTO notes (user_id, title, content, image_url) VALUES ($1, $2, $3, $4) RETURNING id, title, content, image_url, created_at, updated_at',
        [req.user.userId, title, content || '', imageUrl]
      );

      res.status(201).json({
        message: 'Note created successfully',
        note: result.rows[0],
      });
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Update note
router.put('/:id',
  authenticateToken,
  upload.single('image'),
  [
    body('title').trim().optional(),
    body('content').trim().optional(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Check if note exists and belongs to user
      const noteCheck = await pool.query(
        'SELECT id, image_url FROM notes WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.userId]
      );

      if (noteCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Note not found' });
      }

      const existingNote = noteCheck.rows[0];
      let imageUrl = existingNote.image_url;

      // Handle image update
      if (req.file) {
        // Delete old image from S3 if exists
        if (existingNote.image_url) {
          try {
            const key = existingNote.image_url.split('/').slice(-2).join('/');
            await deleteFromS3(key);
          } catch (error) {
            console.warn('⚠️  Could not delete old image from S3:', error.message);
          }
        }

        // Upload new image
        try {
          const uploadResult = await uploadToS3(req.file, 'notes');
          imageUrl = uploadResult.url;
        } catch (error) {
          // For local development: allow note update without image if S3 is not configured
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️  S3 upload failed (AWS credentials may not be configured). Updating note without image.');
            imageUrl = existingNote.image_url; // Keep existing image URL
          } else {
            return res.status(500).json({ message: 'Failed to upload image. Please check AWS S3 configuration.' });
          }
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (req.body.title !== undefined) {
        updates.push(`title = $${paramCount++}`);
        values.push(req.body.title);
      }

      if (req.body.content !== undefined) {
        updates.push(`content = $${paramCount++}`);
        values.push(req.body.content);
      }

      if (req.file) {
        updates.push(`image_url = $${paramCount++}`);
        values.push(imageUrl);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(req.params.id, req.user.userId);

      const result = await pool.query(
        `UPDATE notes SET ${updates.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING id, title, content, image_url, created_at, updated_at`,
        values
      );

      res.json({
        message: 'Note updated successfully',
        note: result.rows[0],
      });
    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Delete note
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Get note to check ownership and get image URL
    const noteCheck = await pool.query(
      'SELECT image_url FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Note not found' });
    }

    // Delete image from S3 if exists
    if (noteCheck.rows[0].image_url) {
      try {
        const key = noteCheck.rows[0].image_url.split('/').slice(-2).join('/');
        await deleteFromS3(key);
      } catch (error) {
        console.warn('⚠️  Could not delete image from S3:', error.message);
        // Continue with note deletion even if S3 delete fails
      }
    }

    // Delete note from database
    await pool.query(
      'DELETE FROM notes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

