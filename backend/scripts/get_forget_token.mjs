import dotenv from 'dotenv';
dotenv.config({ path: './.env' });
import mongoose from 'mongoose';
import User from '../src/db/mongodb/models/user.model.js';

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const u = await User.default.findOne({ email: 'aadityavishwakarma208@gmail.com' }).select('+forgetToken +forgetTokenCreateAt');
    if (!u) {
      console.log('User not found');
      process.exit(0);
    }
    console.log('forgetToken length:', u.forgetToken ? u.forgetToken.length : null);
    console.log('forgetToken:', u.forgetToken);
    console.log('forgetTokenCreateAt:', u.forgetTokenCreateAt);
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

run();
