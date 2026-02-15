const mongoose = require('mongoose');

const vibeActionSchema = new mongoose.Schema({
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['tick', 'cross'], required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('VibeAction', vibeActionSchema);