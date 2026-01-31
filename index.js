import { FileStorage, MemoryStorage, LocalStorage, GoogleSheetsStorage, GASStorage } from './src/Storage.js';

LitheDB.FileStorage = FileStorage;
LitheDB.MemoryStorage = MemoryStorage;
LitheDB.LocalStorage = LocalStorage;
LitheDB.GoogleSheetsStorage = GoogleSheetsStorage;
LitheDB.GASStorage = GASStorage;

export default LitheDB;
export { FileStorage, MemoryStorage, LocalStorage, GoogleSheetsStorage, GASStorage };
