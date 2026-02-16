import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface IUser extends Document {
  clerkId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  plan: 'free' | 'professional' | 'enterprise';
  credits: {
    total: number;
    used: number;
    resetAt: Date;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    plan: { type: String, enum: ['free', 'professional', 'enterprise'], default: 'free' },
    credits: {
      total: { type: Number, default: 3 },
      used: { type: Number, default: 0 },
      resetAt: { type: Date, default: () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1) },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = (models.User || model<IUser>('User', UserSchema)) as Model<IUser>;
