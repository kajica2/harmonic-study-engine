// Node shim file for browser compatibility
export const statSync = () => {
  return {
    size: 0,
    mtime: new Date(),
    isDirectory: () => false,
    isFile: () => true
  };
};

export const createReadStream = () => {
  return null;
};

export const promises = {
  readFile: async () => "",
  stat: async () => ({ size: 0 }),
};

export const isIP = () => false;

export default {
  statSync,
  createReadStream,
  promises,
  isIP,
};
