import LitheDB from './src/LitheDB.js';
import { FileStorage, MemoryStorage, LocalStorage } from './src/Storage.js';

LitheDB.FileStorage = FileStorage;
LitheDB.MemoryStorage = MemoryStorage;
LitheDB.LocalStorage = LocalStorage;

export default LitheDB;
export { FileStorage, MemoryStorage, LocalStorage };
