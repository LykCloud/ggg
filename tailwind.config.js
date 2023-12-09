/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./themes/**/**/*.ejs"],
  theme: {
    extend: {},
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}