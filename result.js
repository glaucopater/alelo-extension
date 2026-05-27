const params = new URLSearchParams(window.location.search);

const imageUrl = params.get("imageUrl") || "No image URL";
const result = params.get("result") || "No result";

document.getElementById("imageUrl").textContent = imageUrl;
document.getElementById("result").textContent = result;