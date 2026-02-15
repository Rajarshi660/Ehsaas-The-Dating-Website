const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true 
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    profilePic: { 
        type: String, 
        default: '' 
    },
    bio: { 
        type: String, 
        default: 'Hey there! I am using Ehsaas.' 
    },
    gender: { 
        type: String, 
        enum: ['male', 'female', 'other'], 
        required: true 
    },
    interestedIn: { 
        type: String, 
        enum: ['male', 'female', 'other'], 
        required: true 
    },
    genres: { 
        type: [String], 
        default: [] 
    },
    // NEW: Tracks total vibes received from the explore page
    vibeCount: { 
        type: Number, 
        default: 0 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('User', userSchema);