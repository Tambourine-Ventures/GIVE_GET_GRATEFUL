/* ============================================================
   Give, Get, Grateful — front-end behaviour
   No dependencies. Progressive: the page reads fine without it.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("signup-form");
  var status = document.getElementById("form-status");
  var yearEl = document.getElementById("year");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---- Conditional fields -------------------------------------------
     Each .conditional block lists the interest values it applies to in
     data-when. Anything not matching the current choice stays hidden and
     disabled so it never reaches the server.                          */
  function currentInterest() {
    var checked = form && form.querySelector('input[name="interest"]:checked');
    return checked ? checked.value : "book";
  }

  function syncConditionals() {
    if (!form) return;
    var interest = currentInterest();
    form.querySelectorAll(".conditional").forEach(function (block) {
      var applies = (block.dataset.when || "").split(/\s+/).indexOf(interest) !== -1;
      block.hidden = !applies;
      block.querySelectorAll("input, textarea, select").forEach(function (f) {
        f.disabled = !applies;
      });
    });
  }

  /* ---- CTA buttons preselect an interest and jump to the form ------- */
  document.querySelectorAll('a[data-interest]').forEach(function (link) {
    link.addEventListener("click", function () {
      var want = link.dataset.interest;
      var radio = form && form.querySelector('input[name="interest"][value="' + want + '"]');
      if (radio) {
        radio.checked = true;
        syncConditionals();
      }
      // Let the browser handle the #signup jump, then put the cursor where
      // it is useful. Delay keeps it from fighting the smooth scroll.
      window.setTimeout(function () {
        var email = document.getElementById("email");
        if (email && !email.value) email.focus({ preventScroll: true });
      }, 650);
    });
  });

  if (!form) return;

  form.querySelectorAll('input[name="interest"]').forEach(function (radio) {
    radio.addEventListener("change", syncConditionals);
  });
  syncConditionals();

  /* ---- Submission ---------------------------------------------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function setStatus(message, kind) {
    status.textContent = message;
    status.classList.remove("is-error", "is-success");
    if (kind) status.classList.add("is-" + kind);
  }

  function referralSource() {
    var params = new URLSearchParams(window.location.search);
    return (
      params.get("utm_source") ||
      params.get("ref") ||
      (document.referrer ? new URL(document.referrer).hostname : "") ||
      "direct"
    ).slice(0, 120);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var emailEl = document.getElementById("email");
    var email = emailEl.value.trim();

    if (!EMAIL_RE.test(email)) {
      emailEl.setAttribute("aria-invalid", "true");
      emailEl.focus();
      setStatus("That email doesn't look right — mind checking it?", "error");
      return;
    }
    emailEl.removeAttribute("aria-invalid");

    var data = new FormData(form);
    var payload = {
      email: email,
      name: (data.get("name") || "").toString().trim(),
      interest: currentInterest(),
      organization: (data.get("organization") || "").toString().trim(),
      message: (data.get("message") || "").toString().trim(),
      company_website: (data.get("company_website") || "").toString(), // honeypot
      source: referralSource()
    };

    var button = form.querySelector(".btn-submit");
    button.disabled = true;
    button.classList.add("is-busy");
    setStatus("Sending…");

    fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, status: res.status, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok) {
          throw new Error(result.body.error || "Something went wrong on our end.");
        }
        form.classList.add("is-done");
        setStatus(
          payload.interest === "book"
            ? "You're on the list. The first chapter lands in your inbox before it lands anywhere else."
            : "Thank you — your note is in. Expect a real reply within two business days.",
          "success"
        );
        status.focus && status.focus();
      })
      .catch(function (err) {
        setStatus(err.message + " Try again, or email hello@givegetgrateful.com.", "error");
      })
      .finally(function () {
        button.disabled = false;
        button.classList.remove("is-busy");
      });
  });
})();
