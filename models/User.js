const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    age: { type: Number, required: true },
    dob: { type: Date, required: true },
    genres: [String],
    bio: { type: String, default: "Vibing on Ehsaas ✨" },
    profilePic: { type: String, default: "" }, // Stores path to user image
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);