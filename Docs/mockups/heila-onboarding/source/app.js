(() => {
  const root = document.getElementById("heila-onboarding");
  const assets = {
    heila: "assets/heila.webp",
    saudi: "assets/saudi.webp",
    italian: "assets/italian.webp",
    wash: "assets/wash.webp",
  };
  const content = root.querySelector("#intro-content");
  const next = root.querySelector(".t-next");
  const pause = root.querySelector(".t-pause");
  const caption = root.querySelector(".t-caption");
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let step = 0,
    start = 0,
    elapsed = 0,
    raf = 0,
    playing = !reducedQuery.matches,
    selected = "saudi";
  const settings = { duration: 8, autoMotion: !reducedQuery.matches };
  const paths = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    "map-pin":
      '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    wallet:
      '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M16 11h5v5h-5zM3 8V5l14-3v3"/>',
    "calendar-days":
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M7 2v6M17 2v6M7 14h3M14 14h3"/>',
    "share-2":
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-3m-6 7 6 3"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    pause: '<path d="M8 4v16M16 4v16"/>',
    "rotate-ccw": '<path d="M3 11a9 9 0 1 1 3 8M3 3v8h8"/>',
  };
  const icon = (name) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || paths["check"]) +
    "</svg>";
  function icons() {
    root.querySelectorAll("i[data-icon]").forEach((item) => {
      item.outerHTML = icon(item.dataset.icon);
    });
  }
  function art(inner, label, scene) {
    return (
      '<div class="t-art t-' +
      scene +
      '" role="group" aria-label="' +
      label +
      '"><img class="t-wash" src="' +
      assets.wash +
      '" alt="">' +
      inner +
      "</div>"
    );
  }
  function heila(message) {
    return (
      '<img class="t-heila" data-move src="' +
      assets.heila +
      '" alt="هيلة، مرشدتك في ذوق"><div class="t-speech" data-move><small>هيلة</small><p>' +
      message +
      "</p></div>"
    );
  }
  const logoSource = "assets/thouq-yadullak-logo.webp";
  const preferencesTitleSource = "assets/nabda-bithoqak-title.webp";
  const outingTitleSource = "assets/invitation-to-gathering-title.webp";
  function brandTitle(source = logoSource, label = "ذوق يدلّك") {
    return (
      '<h2 class="t-title t-title-logo"><img src="' +
      source +
      '" alt="' +
      label +
      '" width="864" height="291"></h2>'
    );
  }
  function footer(eyebrow, title, copy) {
    const titleImages = {
      "ذوقك يدلّك": logoSource,
      "نبدأ بذوقك": preferencesTitleSource,
      "من دعوة إلى جمعة": outingTitleSource,
    };
    const heading = titleImages[title]
      ? brandTitle(
          titleImages[title],
          title === "ذوقك يدلّك" ? "ذوق يدلّك" : title,
        )
      : '<h2 class="t-title">' + title + "</h2>";
    return (
      '<p class="t-eyebrow">' +
      eyebrow +
      "</p>" +
      heading +
      '<p class="t-copy">' +
      copy +
      "</p>"
    );
  }
  function discovery() {
    return (
      art(
        '<div class="t-search" data-move>' +
          icon("search") +
          '<span class="t-query">وش تشتهي؟</span><span class="t-caret"></span></div><div class="t-side-result" data-move><img src="' +
          assets.italian +
          '" alt=""><div class="t-result-body">خيارات أكثر</div></div><div class="t-main-result" data-move><img class="t-photo" src="' +
          assets.saudi +
          '" alt="طبق سعودي"><div class="t-result-body"><p class="t-result-title">مطعم سعودي</p><div class="t-result-meta">' +
          icon("map-pin") +
          "الرياض · اكتشف التفاصيل</div></div></div>" +
          heila("أنا هيلة، نكتشف سوا؟"),
        "هيلة ترافق البحث عن مطبخ سعودي ثم ظهور بطاقة مطعم",
        "discovery",
      ) +
      footer(
        "هيلة معك، من أول اختيار",
        "ذوقك يدلّك",
        "ابحث عن مطعم أو مطبخ تحبّه،<br>واكتشف خيارات تستاهل التجربة.",
      )
    );
  }
  function preferences() {
    return (
      art(
        '<div class="t-tastes"><button class="t-taste" data-move type="button" data-cuisine="saudi" aria-pressed="false"><img src="' +
          assets.saudi +
          '" alt=""><span>سعودي</span><div class="t-selected-mark">' +
          icon("check") +
          '</div></button><button class="t-taste" data-move type="button" data-cuisine="italian" aria-pressed="false"><img src="' +
          assets.italian +
          '" alt=""><span>إيطالي</span><div class="t-selected-mark">' +
          icon("check") +
          '</div></button></div><div class="t-filters"><div class="t-filter" data-move>' +
          icon("wallet") +
          'على ميزانيتك</div><div class="t-filter" data-move>' +
          icon("map-pin") +
          'بالمسافة اللي تختارها</div></div><div class="t-personal-result" data-move><img src="' +
          assets.saudi +
          '" alt="اقتراح يناسب المطبخ المحدد"><div class="t-personal-body"><p class="t-overline">اقتراح يناسبك</p><strong>مطبخ سعودي</strong><p class="t-reason">لأنك تحب الأكل السعودي</p></div></div>' +
          '<div class="t-guide">' +
          heila("قلّي وش تحب؟") +
          "</div>",
        "اختيار المطبخ يغير الاقتراح وتتفاعل معه هيلة",
        "preferences",
      ) +
      footer(
        "اختياراتك تصنع الفرق",
        "نبدأ بذوقك",
        "حدّد اللي تحبّه وميزانيتك والمسافة،<br>عشان تكون الاقتراحات أقرب لك.",
      )
    );
  }
  function outing() {
    const people = [
      ["أ", "أنت"],
      ["س", "سارة"],
      ["ع", "عمر"],
    ]
      .map(
        (p) =>
          '<div class="t-person" data-move><div class="t-avatar">' +
          p[0] +
          '<div class="t-joined">' +
          icon("check") +
          '</div></div><div class="t-person-name">' +
          p[1] +
          "</div></div>",
      )
      .join("");
    return (
      art(
        '<div class="t-invite" data-move><div class="t-invite-label">' +
          icon("calendar-days") +
          'جمعتكم صار لها موعد.</div><strong>عشاء الأصحاب</strong><div class="t-invite-meta">الخميس · ٨:٣٠ مساءً · الرياض</div><div class="t-share">' +
          icon("share-2") +
          "</div></div>" +
          heila("نرتّب الطلعة؟") +
          '<div class="t-people">' +
          people +
          '</div><div class="t-group-result" data-move>تفضيلاتكم، جاهزيتكم، ثم التصويت والنتيجة</div>',
        "هيلة مع دعوة الطلعة ثم يظهر انضمام الأصحاب ومشاركة الأذواق",
        "outing",
      ) +
      footer(
        "الجمعة أحلى مع بعض",
        "من دعوة إلى جمعة",
        "حدّد الموعد والمنطقة، وشارك الدعوة.<br>بعد التفضيلات والجاهزية، تصوّتون وتظهر النتيجة.",
      )
    );
  }
  function chooseCuisine(value, manual = false) {
    selected = value;
    content
      .querySelectorAll("[data-cuisine]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.cuisine === value)),
      );
    const result = content.querySelector(".t-personal-result");
    if (!result) return;
    result.querySelector("img").src = assets[value];
    result.querySelector("strong").textContent =
      value === "saudi" ? "مطبخ سعودي" : "مطبخ إيطالي";
    result.querySelector(".t-reason").textContent =
      value === "saudi" ? "لأنك تحب الأكل السعودي" : "لأنك تحب الأكل الإيطالي";
    if (manual) {
      cancelAnimationFrame(raf);
      playing = false;
      elapsed = settings.duration * 1000;
      phase(1);
      caption.textContent = "تغيّر الاقتراح مع اختيارك";
      updatePause();
    }
  }
  function phase(p) {
    const a = content.querySelector(".t-art");
    if (!a) return;
    a.classList.toggle("p1", p >= 0.08);
    a.classList.toggle("p2", p >= 0.4);
    a.classList.toggle("p3", p >= 0.7);
    if (step === 0) {
      const text = "سعودي";
      const n = Math.max(
        0,
        Math.min(text.length, Math.floor((p - 0.13) / 0.045)),
      );
      content.querySelector(".t-query").textContent =
        p < 0.13 ? "وش تشتهي؟" : text.slice(0, n);
      content.querySelector(".t-caret").style.opacity = p > 0.46 ? "0" : "1";
    } else if (
      step === 1 &&
      p >= 0.26 &&
      !content.querySelector('[aria-pressed="true"]')
    )
      chooseCuisine("saudi");
    const messages =
      step === 0
        ? [
            "أنا هيلة، نكتشف سوا؟",
            "سعودي؟ خلّنا نشوف!",
            "لقيت بداية حلوة لطلعتك!",
          ]
        : step === 1
          ? [
              "قلّي وش تحب؟",
              "ونراعي ميزانيتك والمسافة",
              "ذوقك " +
                (selected === "italian" ? "إيطالي" : "سعودي") +
                "؟ هذا يناسبك!",
            ]
          : [
              "نرتّب الطلعة؟",
              "الدعوة وصلت… باقي أذواقكم",
              "كل ذوق له مكان في جمعتكم",
            ];
    const speech = content.querySelector(".t-speech p");
    const message = messages[p >= 0.7 ? 2 : p >= 0.4 ? 1 : 0];
    if (speech.textContent !== message) speech.textContent = message;
  }
  function updatePause() {
    pause.innerHTML =
      icon(playing ? "pause" : "play") +
      "<span>" +
      (playing ? "إيقاف الحركة" : "تشغيل الحركة") +
      "</span>";
    root.classList.toggle("paused", !playing);
    icons();
  }
  function tick(now) {
    if (!playing) return;
    elapsed = now - start;
    const progress = Math.min(elapsed / (settings.duration * 1000), 1);
    phase(progress);
    if (progress < 1) raf = requestAnimationFrame(tick);
    else {
      playing = false;
      updatePause();
      caption.textContent =
        step === 1
          ? "جرّبي اختيار المطبخ وشوفي الاقتراح يتغيّر"
          : "انتهى المشهد · تقدرين تعيدينه أو تكمّلين";
    }
  }
  function render() {
    window.scrollTo({ top: 0, behavior: "instant" });
    cancelAnimationFrame(raf);
    elapsed = 0;
    selected = "saudi";
    root.classList.remove("paused");
    root.classList.toggle("reduced", reducedQuery.matches);
    content.innerHTML = [discovery, preferences, outing][step]();
    root.querySelector("#intro-count").textContent =
      ["١", "٢", "٣"][step] + " من ٣";
    root.querySelector(".t-dots").hidden = false;
    root.querySelectorAll(".t-dot").forEach((b) => {
      if (Number(b.dataset.step) === step)
        b.setAttribute("aria-current", "step");
      else b.removeAttribute("aria-current");
    });
    next.querySelector("span").textContent = step === 2 ? "افتح ذوق" : "التالي";
    caption.textContent =
      step === 1
        ? "المطبخ والميزانية والمسافة → اقتراح يناسبك"
        : step === 2
          ? "نجتمع · ذوقنا · نصوّت · طلعتنا"
          : "بحث → ظهور المطاعم → اكتشاف التفاصيل";
    icons();
    content
      .querySelectorAll("[data-cuisine]")
      .forEach((b) =>
        b.addEventListener("click", () =>
          chooseCuisine(b.dataset.cuisine, true),
        ),
      );
    playing = settings.autoMotion && !reducedQuery.matches;
    updatePause();
    if (playing) {
      start = performance.now();
      raf = requestAnimationFrame(tick);
    } else phase(1);
  }
  next.addEventListener("click", () => {
    if (step < 2) {
      step++;
      render();
    } else {
      window.location.assign("https://thouq.onrender.com");
    }
  });
  root.querySelectorAll(".t-dot").forEach((b) =>
    b.addEventListener("click", () => {
      step = Number(b.dataset.step);
      render();
    }),
  );
  root.querySelector(".t-replay").addEventListener("click", () => {
    render();
  });
  pause.addEventListener("click", () => {
    if (playing) {
      playing = false;
      cancelAnimationFrame(raf);
    } else {
      if (elapsed >= settings.duration * 1000 || elapsed === 0) {
        render();
        cancelAnimationFrame(raf);
        elapsed = 0;
      }
      root.classList.remove("reduced");
      playing = true;
      start = performance.now() - elapsed;
      raf = requestAnimationFrame(tick);
    }
    updatePause();
  });
  reducedQuery.addEventListener("change", render);
  render();
})();
