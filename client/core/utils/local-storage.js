/* global localStorage */

export const local_storage_adapter = {
  getItem(key) {
    // return promise to match AsyncStorage usage on mobile
    return new Promise((resolve, reject) => {
      try {
        const d = JSON.parse(localStorage.getItem(key))
        resolve(d)
      } catch (e) {
        reject(e)
      }
    })
  },

  removeItem(key) {
    localStorage.removeItem(key)
  },

  setItem(key, value) {
    localStorage.setItem(key, JSON.stringify(value))
  }
}
