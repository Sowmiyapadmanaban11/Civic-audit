// ============================================================
// CivicAudit — auth.js
// Handles register.html and login.html forms.
// ============================================================


document.addEventListener("DOMContentLoaded", () => {
  wireRegisterForm();
  wireLoginForm();
  wireForgotPassword();
});

// ---------------- REGISTER ----------------
function wireRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;

  const roleOptions = document.querySelectorAll("#role-picker .role-option");
  const proFields = document.getElementById("professional-fields");
  let selectedRole = "owner";

  roleOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      roleOptions.forEach((o) => o.classList.remove("active"));
      opt.classList.add("active");
      selectedRole = opt.dataset.role;
      proFields.classList.toggle("hidden", selectedRole !== "professional");
      document.getElementById("professional_type").required = selectedRole === "professional";
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlerts(form);

    const fullName = form.full_name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirm_password.value;
    const professionalType = form.professional_type ? form.professional_type.value : null;
    const companyName = form.company_name ? form.company_name.value.trim() : null;
    const location = form.location.value.trim();

    let hasError = false;
    if (fullName.length < 2) { setFieldError(form.full_name, "Enter your full name."); hasError = true; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { setFieldError(form.email, "Enter a valid email."); hasError = true; }
    if (password.length < 8) { setFieldError(form.password, "Password must be at least 8 characters."); hasError = true; }
    if (password !== confirmPassword) { setFieldError(form.confirm_password, "Passwords don't match."); hasError = true; }
    if (selectedRole === "professional" && !professionalType) {
      setFieldError(form.professional_type, "Select your professional type."); hasError = true;
    }
    if (hasError) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Creating account…";

    try {
      const sb = getSupabase();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: selectedRole,
            professional_type: selectedRole === "professional" ? professionalType : null,
            company_name: companyName || null,
            location: location || null,
          },
        },
      });
      if (error) throw error;

      // Store phone separately (not part of auth metadata trigger)
      if (data.user && phone) {
        await sb.from("profiles").update({ phone }).eq("id", data.user.id);
      }

      if (data.session) {
        window.location.href = "dashboard.html";
      } else {
        showAlert(form, "success", "Account created! Check your email to confirm, then log in.");
        setTimeout(() => (window.location.href = "login.html"), 2500);
      }
    } catch (err) {
      showAlert(form, "error", friendlyError(err, "Could not create account. Please try again."));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create account";
    }
  });
}

// ---------------- LOGIN ----------------
function wireLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAlerts(form);

    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) {
      showAlert(form, "error", "Enter your email and password.");
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Logging in…";

    try {
      const sb = getSupabase();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "dashboard.html";
    } catch (err) {
      showAlert(form, "error", friendlyError(err, "Login failed. Please try again."));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";
    }
  });
}

// ---------------- FORGOT PASSWORD ----------------
function wireForgotPassword() {
  const link = document.getElementById("forgot-password-link");
  if (!link) return;
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = prompt("Enter your account email to receive a reset link:");
    if (!email) return;
    try {
      const sb = getSupabase();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname.replace("login.html", "login.html"),
      });
      if (error) throw error;
      toast("Password reset email sent. Check your inbox.", "success");
    } catch (err) {
      toast(friendlyError(err, "Could not send reset email."), "error");
    }
  });
}

// ---------------- helpers ----------------
function setFieldError(input, message) {
  const field = input.closest(".field");
  if (!field) return;
  field.classList.add("has-error");
  const err = field.querySelector(".field-error");
  if (err) err.textContent = message;
}
function clearAlerts(form) {
  form.querySelectorAll(".field").forEach((f) => f.classList.remove("has-error"));
  const alert = form.querySelector(".form-alert");
  if (alert) alert.classList.remove("show", "error", "success");
}
function showAlert(form, type, message) {
  let alert = form.querySelector(".form-alert");
  if (!alert) {
    alert = document.createElement("div");
    alert.className = "form-alert";
    form.prepend(alert);
  }
  alert.textContent = message;
  alert.classList.add("show", type);
}

function friendlyError(err, fallback) {
  if (err && err.message) return err.message;
  return fallback || "Something went wrong. Please try again.";
}
