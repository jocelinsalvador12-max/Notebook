/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/frontend/**/*.{html,js}"
    ],
    theme: {
        extend: {
            colors: {
                peach: '#FFE5EC',
                lavender: '#E8E8E4',
                mint: '#D8F3DC'
            }
        },
    },
    plugins: [],
}