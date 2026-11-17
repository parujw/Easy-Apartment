/** Full page load in the same tab. Print/PDF pages use this: pop-ups and new tabs are blocked inside LINE and home-screen apps. */
export const hardGo = (url: string) => { window.location.href = url; };
