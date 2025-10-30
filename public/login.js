// public/login.js
async function login() {
  try {
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    if (!username || !password) {
      alert("Enter username and password");
      return;
    }

    const res = await fetch("/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    // read response as text first so we can show raw body if it's not JSON
    const text = await res.text();

    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error("Non-JSON response from /login:", text);
      alert("Server error — check console (non-JSON response).");
      return;
    }

    if (!res.ok) {
      console.error("Login failed:", data);
      alert(data?.error || data?.message || "Login failed (see console)");
      return;
    }

    // success path
    if (data && data.success) {
      localStorage.setItem("username", data.username || username);
      window.location.href = "chat.html";
    } else {
      alert(data?.message || "Login failed");
    }
  } catch (err) {
    console.error("Network or JS error during login:", err);
    alert("Network error — check console.");
  }
}

// bind to a button click if you use onclick attribute, otherwise:
document.querySelector("button")?.addEventListener("click", login);
