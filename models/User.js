const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    interestedIn: { type: String, enum: ['male', 'female', 'other'], required: true },
    genres: [String],
    bio: { type: String, default: "" },
    profilePic: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);