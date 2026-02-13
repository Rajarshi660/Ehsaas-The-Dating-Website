const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contentUrl: { type: String, required: true },
    caption: { type: String, default: "" },
    type: { type: String, enum: ['image', 'video'], default: 'image' },
    vibe: { type: String, default: 'minimal' }, // Options: techno, cottage, minimal, etc.
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);