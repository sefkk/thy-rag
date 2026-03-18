(function () {
  "use strict";

  var API_BASE = (typeof window !== "undefined" && window.API_BASE) ? window.API_BASE : "";

  function apiUrl(path) {
    return (API_BASE || window.location.origin) + path;
  }

  function hideAppLoading() {
    var el = document.getElementById("app-loading");
    if (el) el.classList.add("hidden");
  }

  function waitForServer(retries, intervalMs) {
    retries = retries != null ? retries : 20;
    intervalMs = intervalMs != null ? intervalMs : 1500;
    function tryFetch() {
      fetch(apiUrl("/api/health"))
        .then(function (r) { if (r.ok) hideAppLoading(); })
        .catch(function () {})
        .finally(function () {
          var el = document.getElementById("app-loading");
          if (el && !el.classList.contains("hidden") && retries > 0) {
            setTimeout(function () { waitForServer(retries - 1, intervalMs); }, intervalMs);
          } else if (el && !el.classList.contains("hidden")) {
            hideAppLoading();
          }
        });
    }
    tryFetch();
  }
  waitForServer();

  var STORAGE_KEY = "thy_tickets";
  var currentPage = "home";
  var flightsData = { routes: [], flights: [] };
  var airportsData = { airports: [] };
  var FREE_CANCELLATION_FEE = 799;

  var bookingState = {
    flight: null,
    returnFlight: null,
    selectingReturnFlight: false,
    passengerCount: 1,
    passengers: [],
    baggageOption: "cabin",
    seatPreference: "",
    returnBaggageOption: "cabin",
    returnSeatPreference: "",
    specialNeeds: "",
    totalPrice: 0,
    baseFlightTotal: 0,
    freeCancellation: false
  };

  var BAGAGE_FEES = { cabin: 0, "15kg": 285, "20kg": 465, "25kg": 605 };
  var SEAT_FEES = { "": 0, window: 355, aisle: 355, middle: 75 };

  function getSeatFee(value) {
    return (SEAT_FEES[value] != null) ? SEAT_FEES[value] : 0;
  }

  function getBaggageSeatExtras() {
    var bagOut = BAGAGE_FEES[document.getElementById("baggage-option") && document.getElementById("baggage-option").value] || 0;
    var seatOut = getSeatFee(document.getElementById("seat-preference") && document.getElementById("seat-preference").value);
    var bagRet = 0, seatRet = 0;
    if (bookingState.returnFlight) {
      var bagRetEl = document.getElementById("baggage-option-return");
      var seatRetEl = document.getElementById("seat-preference-return");
      if (bagRetEl) bagRet = BAGAGE_FEES[bagRetEl.value] || 0;
      if (seatRetEl) seatRet = getSeatFee(seatRetEl.value);
    }
    return (bagOut + seatOut + bagRet + seatRet) * (bookingState.passengerCount || 1);
  }

  function updateBaggageSeatTotal() {
    updateBookingTotalBar("page-baggage-seat");
  }

  function getCurrentDateForChat() {
    var d = new Date();
    var months = "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık".split(" ");
    var iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var tr = d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
    return "Bugünün tarihi: " + tr + " (" + iso + ").";
  }

  function getCurrentDisplayedFlights() {
    if (currentPage !== "flight-list" || !flightsData.flights || !flightsData.routes) return [];
    var params = getSearchParams();
    var routes = flightsData.routes || [];
    var wantedPax = Math.min(2, Math.max(1, params.passengerCount));
    if (bookingState.selectingReturnFlight) {
      var returnRouteIndex = getRouteIndex(params.toCode, params.fromCode);
      if (returnRouteIndex < 0) return [];
      return flightsData.flights.filter(function (f) {
        return f.routeIndex === returnRouteIndex && f.date === params.returnDate && (f.maxPassengers || 1) === wantedPax;
      });
    }
    var routeIndex = getRouteIndex(params.fromCode, params.toCode);
    if (routeIndex < 0) return [];
    return flightsData.flights.filter(function (f) {
      return f.routeIndex === routeIndex && f.date === params.departureDate && (f.maxPassengers || 1) === wantedPax;
    });
  }

  function getSearchContextForChat() {
    if (currentPage !== "flight-list") return "";
    var params = getSearchParams();
    var list = getCurrentDisplayedFlights();
    var listEmpty = list.length === 0;
    var parts = ["Uçuş listesi sayfasında. Arama: Nereden " + (params.fromCode || "?") + ", Nereye " + (params.toCode || "?") + ", Gidiş " + (params.departureDate || "?") + ", Dönüş " + (params.returnDate || "?") + ", Yolcu " + (params.passengerCount || "?") + "."];
    if (listEmpty) parts.push("Listede uçuş görünmüyor (0 sonuç). Demo uçuşlar 9-27 Mart 2026 ve sadece İstanbul, Ankara, Amsterdam güzergahlarındadır.");
    else {
      parts.push("Kullanıcının gördüğü uçuşlar (" + list.length + " adet):");
      list.forEach(function (f) {
        parts.push(" " + (f.id || "") + " kalkış " + (f.depTime || "") + " varış " + (f.arrTime || "") + " " + formatDate(f.date) + " " + (f.price || 0) + " ₺ " + (f.maxPassengers || 1) + " kişi");
      });
    }
    return parts.join("\n");
  }

  function getBookingContextForChat() {
    var total = (currentPage === "baggage-seat" && bookingState.baseFlightTotal != null)
      ? (bookingState.baseFlightTotal + getBaggageSeatExtras())
      : (bookingState.totalPrice || 0);
    if (!bookingState.flight || total <= 0) return "";
    var pax = bookingState.passengerCount || 1;
    var roundTrip = !!bookingState.returnFlight;
    var bagOut = (document.getElementById("baggage-option") && document.getElementById("baggage-option").value) || bookingState.baggageOption || "cabin";
    var seatOut = (document.getElementById("seat-preference") && document.getElementById("seat-preference").value) || bookingState.seatPreference || "";
    var bagRet = (document.getElementById("baggage-option-return") && document.getElementById("baggage-option-return").value) || bookingState.returnBaggageOption || "cabin";
    var seatRet = (document.getElementById("seat-preference-return") && document.getElementById("seat-preference-return").value) || bookingState.returnSeatPreference || "";
    var bagLabels = { cabin: "Sadece kabin", "15kg": "+15 kg", "20kg": "+20 kg", "25kg": "+25 kg" };
    var seatLabels = { "": "Yok", window: "Pencere", aisle: "Koridor", middle: "Orta" };
    var lines = [
      "Güncel toplam: " + total.toLocaleString("tr-TR") + " ₺.",
      "Yolcu sayısı: " + pax + ". " + (roundTrip ? "Gidiş-dönüş." : "Tek yön."),
      "Gidiş: bagaj " + (bagLabels[bagOut] || bagOut) + ", koltuk " + (seatLabels[seatOut] || seatOut || "yok") + "."
    ];
    if (roundTrip) lines.push("Dönüş: bagaj " + (bagLabels[bagRet] || bagRet) + ", koltuk " + (seatLabels[seatRet] || seatRet || "yok") + ".");
    lines.push("Ücretsiz iptal hakkı: " + (bookingState.freeCancellation ? "Var (+799 ₺)" : "Yok (Son Kontrol sayfasında 799 ₺ ile eklenebilir)."));
    lines.push("Ücret tablosu (yolcu başı, uçuş başı): Bagaj – Kabin 0 ₺; +15 kg " + (BAGAGE_FEES["15kg"] || 0) + " ₺; +20 kg " + (BAGAGE_FEES["20kg"] || 0) + " ₺; +25 kg " + (BAGAGE_FEES["25kg"] || 0) + " ₺. Koltuk – Seçmeyebilirsiniz 0 ₺; Pencere/Koridor " + (SEAT_FEES.window || 0) + " ₺; Orta " + (SEAT_FEES.middle || 0) + " ₺.");
    return lines.join(" ");
  }

  var BOOKING_SECTIONS_WITH_TOTAL = ["page-flight-list", "page-passenger", "page-baggage-seat", "page-special-needs", "page-lastcheck", "page-payment"];

  function updateBookingTotalBar(sectionId) {
    var bar = document.getElementById("booking-total-bar");
    var amountEl = document.getElementById("booking-total-amount");
    if (!bar || !amountEl) return;
    var show = sectionId && BOOKING_SECTIONS_WITH_TOTAL.indexOf(sectionId) >= 0;
    if (show) {
      bar.classList.remove("hidden");
      var total = (sectionId === "page-baggage-seat" && bookingState.baseFlightTotal != null)
        ? (bookingState.baseFlightTotal + getBaggageSeatExtras())
        : (bookingState.totalPrice || 0);
      amountEl.textContent = total.toLocaleString("tr-TR");
    } else {
      bar.classList.add("hidden");
    }
  }

  function getTickets() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveTickets(tickets) {
    if (!Array.isArray(tickets)) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
    } catch (e) {
      console.error("Bilet kaydedilemedi:", e);
    }
  }

  function formatDate(str) {
    if (!str) return "";
    var d = new Date(str + "T12:00:00");
    var months = "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık".split(" ");
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function isExpired(dateStr) {
    return dateStr && new Date(dateStr) < new Date(new Date().toDateString());
  }

  function generatePNR() {
    var s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 6; i++) out += s[Math.floor(Math.random() * s.length)];
    return out;
  }

  function showSection(sectionId) {
    document.querySelectorAll(".page-section").forEach(function (el) {
      el.classList.add("hidden");
    });
    document.getElementById("booking-card").classList.add("hidden");
    document.getElementById("hero-booking").classList.add("hidden");
    var el = document.getElementById(sectionId);
    if (el) el.classList.remove("hidden");
    updateBookingTotalBar(sectionId);
  }

  function setPage(pageId) {
    currentPage = pageId || "home";
    var mainBooking = document.getElementById("main-booking");
    var mainTickets = document.getElementById("main-my-tickets");
    var hero = document.getElementById("hero-booking");
    var card = document.getElementById("booking-card");

    document.querySelectorAll(".nav-link").forEach(function (a) {
      a.classList.toggle("active", (a.getAttribute("data-page") || "") === currentPage);
    });

    if (currentPage === "my-tickets") {
      if (mainBooking) { mainBooking.classList.add("hidden"); mainBooking.style.display = "none"; }
      if (mainTickets) {
        mainTickets.classList.remove("hidden");
        mainTickets.style.display = "block";
        var myTicketsSection = document.getElementById("page-my-tickets");
        if (myTicketsSection) myTicketsSection.classList.remove("hidden");
      }
      renderMyTickets();
      updateBookingTotalBar(null);
      return;
    }

    if (mainTickets) { mainTickets.classList.add("hidden"); mainTickets.style.display = "none"; }
    if (mainBooking) { mainBooking.classList.remove("hidden"); mainBooking.style.display = ""; }

    document.querySelectorAll(".page-section").forEach(function (el) {
      el.classList.add("hidden");
    });
    card.classList.add("hidden");
    hero.classList.add("hidden");

    if (currentPage === "home") {
      hero.classList.remove("hidden");
      card.classList.remove("hidden");
      updateBookingTotalBar(null);
      return;
    }

    var section = document.getElementById("page-" + currentPage);
    if (section) {
      section.classList.remove("hidden");
    }
  }

  function showBookingCard() {
    setPage("home");
  }

  function airportLabel(a) {
    return a.city + " (" + a.code + ")";
  }

  function resolveAirportCode(text) {
    var airports = (airportsData.airports || []);
    var t = (text || "").trim();
    if (!t) return null;
    var upper = t.toUpperCase();
    for (var i = 0; i < airports.length; i++) {
      var a = airports[i];
      if (a.code === upper) return a.code;
      if (airportLabel(a) === t || a.city.toLowerCase() === t.toLowerCase()) return a.code;
      if (airportLabel(a).toLowerCase().indexOf(t.toLowerCase()) === 0) return a.code;
    }
    var match = t.match(/\s*\(([A-Z]{3})\)\s*$/i);
    if (match) return match[1].toUpperCase();
    return null;
  }

  function getSearchParams() {
    var depInput = document.getElementById("input-departure-date");
    var retInput = document.getElementById("input-return-date");
    var paxInput = document.getElementById("input-passengers");
    var fromInput = document.getElementById("input-from");
    var toInput = document.getElementById("input-to");
    var activeTab = document.querySelector(".tabs .tab.active");
    var isOneWay = activeTab && (activeTab.getAttribute("data-trip") || "") === "oneway";
    var fromCode = fromInput ? resolveAirportCode(fromInput.value) : null;
    var toCode = toInput ? resolveAirportCode(toInput.value) : null;
    return {
      fromCode: fromCode || "IST",
      toCode: toCode || "ESB",
      departureDate: (depInput && depInput.value) || "2026-03-09",
      returnDate: (retInput && retInput.value) || "2026-03-12",
      passengerCount: parseInt((paxInput && paxInput.value) || "1", 10),
      isOneWay: !!isOneWay
    };
  }

  function getRouteIndex(fromCode, toCode) {
    var routes = flightsData.routes || [];
    for (var i = 0; i < routes.length; i++) {
      if (routes[i].from === fromCode && routes[i].to === toCode) return i;
    }
    return -1;
  }

  function setFlightListTitle(text) {
    var el = document.getElementById("flight-list-title");
    if (el) el.textContent = text || "Uçuş Seçimi";
  }

  function renderFlightList() {
    bookingState.selectingReturnFlight = false;
    setFlightListTitle("Gidiş uçuşu seçin");
    var container = document.getElementById("flight-list-container");
    if (!container || !flightsData.flights) return;
    var params = getSearchParams();
    var routes = flightsData.routes || [];
    var routeIndex = getRouteIndex(params.fromCode, params.toCode);
    if (routeIndex < 0) {
      container.innerHTML = "<p class=\"no-flights\">Bu güzergah için uçuş bulunamadı.</p>";
      return;
    }
    var wantedPax = Math.min(2, Math.max(1, params.passengerCount));
    var outbound = flightsData.flights.filter(function (f) {
      if (f.routeIndex !== routeIndex) return false;
      if (f.date !== params.departureDate) return false;
      if ((f.maxPassengers || 1) !== wantedPax) return false;
      return true;
    });
    container.innerHTML = "";
    if (outbound.length === 0) {
      container.innerHTML = "<p class=\"no-flights\">Bu tarih ve yolcu sayısı için uçuş bulunamadı. Başka tarih veya yolcu sayısı deneyin.</p>";
      return;
    }
    outbound.forEach(function (f) {
      var dateStr = formatDate(f.date);
      var div = document.createElement("div");
      div.className = "flight-item";
      div.innerHTML =
        "<span class=\"flight-id\">" + (f.id || "") + "</span>" +
        "<span class=\"time\">" + f.depTime + " – " + f.arrTime + "</span>" +
        "<span class=\"duration\">" + f.duration + "</span>" +
        "<span class=\"date\">" + dateStr + "</span>" +
        "<span class=\"price\">₺" + (f.price || 0).toLocaleString("tr-TR") + "</span>" +
        "<span class=\"pax-info\">" + f.maxPassengers + " kişi</span>" +
        "<button type=\"button\" class=\"btn-small\" data-select-flight data-flight-id=\"" + (f.id || "") + "\">Seç</button>";
      container.appendChild(div);
    });
  }

  function renderReturnFlightList() {
    bookingState.selectingReturnFlight = true;
    setFlightListTitle("Dönüş uçuşu seçin");
    var container = document.getElementById("flight-list-container");
    if (!container || !flightsData.flights) return;
    var params = getSearchParams();
    var returnRouteIndex = getRouteIndex(params.toCode, params.fromCode);
    if (returnRouteIndex < 0) {
      container.innerHTML = "<p class=\"no-flights\">Dönüş güzergahı için uçuş bulunamadı.</p>";
      return;
    }
    var wantedPax = Math.min(2, Math.max(1, params.passengerCount));
    var returnFlights = flightsData.flights.filter(function (f) {
      if (f.routeIndex !== returnRouteIndex) return false;
      if (f.date !== params.returnDate) return false;
      if ((f.maxPassengers || 1) !== wantedPax) return false;
      return true;
    });
    container.innerHTML = "";
    if (returnFlights.length === 0) {
      container.innerHTML = "<p class=\"no-flights\">Dönüş tarihi için uçuş bulunamadı. Başka tarih deneyin.</p>";
      return;
    }
    returnFlights.forEach(function (f) {
      var dateStr = formatDate(f.date);
      var div = document.createElement("div");
      div.className = "flight-item";
      div.innerHTML =
        "<span class=\"flight-id\">" + (f.id || "") + "</span>" +
        "<span class=\"time\">" + f.depTime + " – " + f.arrTime + "</span>" +
        "<span class=\"duration\">" + f.duration + "</span>" +
        "<span class=\"date\">" + dateStr + "</span>" +
        "<span class=\"price\">₺" + (f.price || 0).toLocaleString("tr-TR") + "</span>" +
        "<span class=\"pax-info\">" + f.maxPassengers + " kişi</span>" +
        "<button type=\"button\" class=\"btn-small\" data-select-flight data-flight-id=\"" + (f.id || "") + "\">Seç</button>";
      container.appendChild(div);
    });
  }

  function bindFlightSelect() {
    document.body.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-select-flight]");
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute("data-flight-id") || "";
      var flight = flightsData.flights.filter(function (f) { return f.id === id; })[0];
      if (!flight) return;
      var params = getSearchParams();
      var pax = Math.min(2, Math.max(1, params.passengerCount));
      bookingState.passengerCount = Math.min(pax, flight.maxPassengers || 1);

      if (bookingState.selectingReturnFlight) {
        bookingState.returnFlight = flight;
        bookingState.totalPrice = ((bookingState.flight ? bookingState.flight.price : 0) + (flight.price || 0)) * bookingState.passengerCount;
        renderPassengerForm();
        setPage("passenger-info");
        showSection("page-passenger");
        return;
      }

      bookingState.flight = flight;
      if (params.isOneWay) {
        bookingState.returnFlight = null;
        bookingState.totalPrice = (flight.price || 0) * bookingState.passengerCount;
        renderPassengerForm();
        setPage("passenger-info");
        showSection("page-passenger");
      } else {
        bookingState.totalPrice = (flight.price || 0) * bookingState.passengerCount;
        renderReturnFlightList();
        updateBookingTotalBar("page-flight-list");
      }
    });
  }

  function renderPassengerForm() {
    var container = document.getElementById("passenger-fields");
    if (!container) return;
    var n = bookingState.passengerCount || 1;
    container.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var h3 = document.createElement("h3");
      h3.className = "passenger-title";
      h3.textContent = "Yolcu " + (i + 1);
      container.appendChild(h3);
      var div = document.createElement("div");
      div.className = "form-row";
      div.innerHTML =
        "<div class=\"field\"><label>Ad <span class=\"required\">*</span></label><input type=\"text\" class=\"input\" data-passenger-index=\"" + i + "\" data-field=\"firstName\" placeholder=\"Ad\" required /></div>" +
        "<div class=\"field\"><label>Soyad <span class=\"required\">*</span></label><input type=\"text\" class=\"input\" data-passenger-index=\"" + i + "\" data-field=\"lastName\" placeholder=\"Soyad\" required /></div>" +
        "<div class=\"field\"><label>E-posta <span class=\"required\">*</span></label><input type=\"email\" class=\"input\" data-passenger-index=\"" + i + "\" data-field=\"email\" placeholder=\"ornek@email.com\" required /></div>" +
        "<div class=\"field\"><label>Telefon <span class=\"required\">*</span></label><input type=\"tel\" class=\"input\" inputmode=\"numeric\" data-passenger-index=\"" + i + "\" data-field=\"phone\" placeholder=\"5XX XXX XX XX\" required /></div>";
      container.appendChild(div);
    }
    bindPassengerPhoneNumbers();
  }

  function bindPassengerPhoneNumbers() {
    var container = document.getElementById("passenger-fields");
    if (!container) return;
    container.querySelectorAll("input[data-field=\"phone\"]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        this.value = this.value.replace(/\D/g, "");
      });
    });
  }

  function collectPassengers() {
    var list = [];
    document.querySelectorAll("[data-passenger-index]").forEach(function (inp) {
      var idx = parseInt(inp.getAttribute("data-passenger-index"), 10);
      var field = inp.getAttribute("data-field");
      if (!list[idx]) list[idx] = {};
      list[idx][field] = inp.value || "";
    });
    for (var i = 0; i < list.length; i++) if (list[i]) bookingState.passengers[i] = list[i];
  }

  function renderLastCheck() {
    var el = document.getElementById("lastcheck-summary");
    if (!el) return;
    var f = bookingState.flight;
    var rf = bookingState.returnFlight;
    var routes = flightsData.routes || [];
    var rOut = (f && routes[f.routeIndex]) ? routes[f.routeIndex] : {};
    var rRet = (rf && routes[rf.routeIndex]) ? routes[rf.routeIndex] : {};
    var routeStrOut = (rOut.fromCity || "") + " – " + (rOut.toCity || "");
    var routeStrRet = (rRet.fromCity || "") + " – " + (rRet.toCity || "");
    var paxStr = (bookingState.passengers || []).map(function (p) {
      return (p.firstName || "") + " " + (p.lastName || "");
    }).filter(Boolean).join(", ") || "—";
    var flightHtml = "<p><strong>Gidiş:</strong> " + (f ? f.depTime + " " + formatDate(f.date) + ", " + routeStrOut : "") + "</p>";
    if (rf) {
      flightHtml += "<p><strong>Dönüş:</strong> " + rf.depTime + " " + formatDate(rf.date) + ", " + routeStrRet + "</p>";
      flightHtml += "<p><strong>Bagaj gidiş:</strong> " + (bookingState.baggageOption === "cabin" ? "Sadece kabin" : bookingState.baggageOption) + " · <strong>Dönüş:</strong> " + (bookingState.returnBaggageOption === "cabin" ? "Sadece kabin" : bookingState.returnBaggageOption) + "</p>";
      flightHtml += "<p><strong>Koltuk gidiş:</strong> " + seatLabel(bookingState.seatPreference) + " · <strong>Dönüş:</strong> " + seatLabel(bookingState.returnSeatPreference) + "</p>";
    } else {
      flightHtml += "<p><strong>Bagaj:</strong> " + (bookingState.baggageOption === "cabin" ? "Sadece kabin" : bookingState.baggageOption) + "</p>";
      flightHtml += "<p><strong>Koltuk tercihi:</strong> " + seatLabel(bookingState.seatPreference) + "</p>";
    }
    el.innerHTML =
      flightHtml +
      "<p><strong>Yolcular:</strong> " + paxStr + "</p>" +
      "<p><strong>Özel ihtiyaç:</strong> " + (bookingState.specialNeeds || "Yok") + "</p>" +
      (bookingState.freeCancellation ? "<p><strong>Ücretsiz iptal hakkı:</strong> Var (+799 ₺)</p>" : "") +
      "<p class=\"total\">Toplam: ₺" + (bookingState.totalPrice || 0).toLocaleString("tr-TR") + "</p>";
  }

  function renderPaymentSummary() {
    var el = document.getElementById("payment-summary");
    if (!el) return;
    var f = bookingState.flight;
    var rf = bookingState.returnFlight;
    var routes = flightsData.routes || [];
    var rOut = (f && routes[f.routeIndex]) ? routes[f.routeIndex] : {};
    var rRet = (rf && routes[rf.routeIndex]) ? routes[rf.routeIndex] : {};
    var routeStrOut = (rOut.fromCity || "") + " – " + (rOut.toCity || "");
    var routeStrRet = (rRet.fromCity || "") + " – " + (rRet.toCity || "");
    var html = "<p><strong>Gidiş " + routeStrOut + "</strong> " + (f ? formatDate(f.date) + ", " + f.depTime : "") + "</p>";
    if (rf) {
      html += "<p><strong>Dönüş " + routeStrRet + "</strong> " + formatDate(rf.date) + ", " + rf.depTime + "</p>";
      html += "<p>" + (bookingState.passengerCount || 1) + " Yolcu · Bagaj gidiş: " + (bookingState.baggageOption === "cabin" ? "Sadece kabin" : bookingState.baggageOption) + ", dönüş: " + (bookingState.returnBaggageOption === "cabin" ? "Sadece kabin" : bookingState.returnBaggageOption) + "</p>";
    } else {
      html += "<p>" + (bookingState.passengerCount || 1) + " Yolcu · Bagaj: " + (bookingState.baggageOption === "cabin" ? "Sadece kabin" : bookingState.baggageOption) + "</p>";
    }
    if (bookingState.freeCancellation) html += "<p>Ücretsiz iptal hakkı: Var</p>";
    html += "<p class=\"total\">Toplam: ₺" + (bookingState.totalPrice || 0).toLocaleString("tr-TR") + "</p>";
    el.innerHTML = html;
  }

  function renderConfirmation(ticket) {
    var el = document.getElementById("confirmation-content");
    if (!el) return;
    el.innerHTML =
      "<div class=\"confirmation-success\">" +
      "<span class=\"confirmation-success-icon\" aria-hidden=\"true\">✓</span>" +
      "<p class=\"confirmation-success-title\">Tebrikler!</p>" +
      "<p class=\"confirmation-success-text\">Ödemeniz gerçekleşti. Biletiniz hazır.</p>" +
      "</div>" +
      "<div class=\"confirmation-details\">" +
      "<p><strong>Rezervasyon kodu (PNR):</strong> " + (ticket.bookingRef || "") + "</p>" +
      "<p><strong>Uçuş:</strong> " + (ticket.routeSummary || "") + "</p>" +
      "<p><strong>Tarih:</strong> " + (ticket.departureDateFormatted || "") + "</p>" +
      "<p>Biletiniz e-posta ile gönderilecektir. Biletlerim sayfasından da görüntüleyebilirsiniz.</p>" +
      "</div>";
  }

  function baggageLabel(val) {
    if (!val || val === "cabin") return "Sadece kabin";
    return val;
  }

  function seatLabel(val) {
    if (!val) return "Yok";
    var m = { window: "Pencere", aisle: "Koridor", middle: "Orta" };
    return m[val] || val;
  }

  function renderMyTickets() {
    var container = document.getElementById("my-tickets-list");
    if (!container) return;
    var tickets = getTickets();
    if (!Array.isArray(tickets) || !tickets.length) {
      container.innerHTML = "<p class=\"no-tickets\">Henüz biletiniz yok. Bilet Al ile rezervasyon yapabilirsiniz.</p>";
      return;
    }
    container.innerHTML = "";
    tickets.forEach(function (t) {
      var expired = isExpired(t.departureDate);
      var card = document.createElement("div");
      card.className = "ticket-card" + (expired ? " ticket-expired" : "");
      var expiredBadge = expired ? "<span class=\"badge expired\">Süresi geçmiş</span>" : "";
      var bag = baggageLabel(t.baggageOption);
      var seat = seatLabel(t.seatPreference);
      if (t.returnFlightId) {
        bag += " · Dönüş: " + baggageLabel(t.returnBaggageOption);
        seat += " · Dönüş: " + seatLabel(t.returnSeatPreference);
      }
      var special = (t.specialNeeds || "").trim() ? (t.specialNeeds || "").trim() : "Yok";
      var freeCancel = t.freeCancellation ? " · Ücretsiz iptal: Var" : "";
      var editBtn = expired ? "" : "<button type=\"button\" class=\"btn-secondary btn-edit-ticket\" data-ticket-id=\"" + (t.id || "") + "\">Biletimi düzenle</button>";
      card.innerHTML =
        "<button type=\"button\" class=\"ticket-delete-btn\" data-ticket-id=\"" + (t.id || "") + "\" aria-label=\"Bileti sil\">×</button>" +
        "<div class=\"ticket-card-header\">" +
        "<strong>PNR: " + (t.bookingRef || "") + "</strong> " + expiredBadge +
        "</div>" +
        "<p>" + (t.routeSummary || "") + "</p>" +
        "<p>" + (t.departureDateFormatted || "") + " · ₺" + (t.totalPrice || 0).toLocaleString("tr-TR") + "</p>" +
        "<p class=\"ticket-card-details\">Bagaj: " + bag + " · Koltuk: " + seat + (special !== "Yok" ? " · Özel ihtiyaç: " + special : "") + freeCancel + "</p>" +
        editBtn;
      container.appendChild(card);
    });
    container.querySelectorAll(".btn-edit-ticket").forEach(function (btn) {
      btn.addEventListener("click", function () { openTicketEdit(btn.getAttribute("data-ticket-id")); });
    });
    container.querySelectorAll(".ticket-delete-btn").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        showDeleteTicketModal(btn.getAttribute("data-ticket-id"));
      });
    });
  }

  var deletingTicketId = null;

  function showDeleteTicketModal(ticketId) {
    deletingTicketId = ticketId;
    var modal = document.getElementById("delete-ticket-modal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
    }
  }

  function closeDeleteTicketModal() {
    deletingTicketId = null;
    var modal = document.getElementById("delete-ticket-modal");
    if (modal) {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function confirmDeleteTicket() {
    if (!deletingTicketId) { closeDeleteTicketModal(); return; }
    var tickets = getTickets().filter(function (t) { return (t.id || "") !== deletingTicketId; });
    saveTickets(tickets);
    renderMyTickets();
    closeDeleteTicketModal();
  }

  var editingTicketId = null;

  function openTicketEdit(ticketId) {
    var tickets = getTickets();
    var t = tickets.find(function (x) { return (x.id || "") === (ticketId || ""); });
    if (!t) return;
    editingTicketId = ticketId;
    var overlay = document.getElementById("ticket-edit-overlay");
    var pnrEl = document.getElementById("ticket-edit-pnr");
    var baggageEl = document.getElementById("ticket-edit-baggage");
    var seatEl = document.getElementById("ticket-edit-seat");
    var specialEl = document.getElementById("ticket-edit-special");
    var returnWrap = document.querySelectorAll(".ticket-edit-return-wrap");
    var baggageReturnEl = document.getElementById("ticket-edit-baggage-return");
    var seatReturnEl = document.getElementById("ticket-edit-seat-return");
    if (pnrEl) pnrEl.textContent = "PNR: " + (t.bookingRef || "");
    if (baggageEl) baggageEl.value = t.baggageOption || "cabin";
    if (seatEl) seatEl.value = t.seatPreference || "";
    if (specialEl) specialEl.value = t.specialNeeds || "";
    if (t.returnFlightId) {
      returnWrap.forEach(function (el) { if (el) el.classList.remove("hidden"); });
      if (baggageReturnEl) baggageReturnEl.value = t.returnBaggageOption || "cabin";
      if (seatReturnEl) seatReturnEl.value = t.returnSeatPreference || "";
    } else {
      returnWrap.forEach(function (el) { if (el) el.classList.add("hidden"); });
    }
    if (overlay) overlay.classList.remove("hidden");
  }

  function closeTicketEdit() {
    editingTicketId = null;
    var overlay = document.getElementById("ticket-edit-overlay");
    if (overlay) overlay.classList.add("hidden");
  }

  function saveTicketEdit() {
    if (!editingTicketId) { closeTicketEdit(); return; }
    var baggageEl = document.getElementById("ticket-edit-baggage");
    var seatEl = document.getElementById("ticket-edit-seat");
    var specialEl = document.getElementById("ticket-edit-special");
    var baggageReturnEl = document.getElementById("ticket-edit-baggage-return");
    var seatReturnEl = document.getElementById("ticket-edit-seat-return");
    var tickets = getTickets();
    var idx = tickets.findIndex(function (x) { return (x.id || "") === editingTicketId; });
    if (idx < 0) { closeTicketEdit(); return; }
    tickets[idx].baggageOption = (baggageEl && baggageEl.value) || "cabin";
    tickets[idx].seatPreference = (seatEl && seatEl.value) || "";
    tickets[idx].specialNeeds = (specialEl && specialEl.value) || "";
    if (tickets[idx].returnFlightId) {
      tickets[idx].returnBaggageOption = (baggageReturnEl && baggageReturnEl.value) || "cabin";
      tickets[idx].returnSeatPreference = (seatReturnEl && seatReturnEl.value) || "";
    }
    saveTickets(tickets);
    renderMyTickets();
    closeTicketEdit();
  }

  function onPay() {
    collectPassengers();
    bookingState.baggageOption = (document.getElementById("baggage-option") && document.getElementById("baggage-option").value) || "cabin";
    bookingState.seatPreference = (document.getElementById("seat-preference") && document.getElementById("seat-preference").value) || "";
    if (bookingState.returnFlight) {
      bookingState.returnBaggageOption = (document.getElementById("baggage-option-return") && document.getElementById("baggage-option-return").value) || "cabin";
      bookingState.returnSeatPreference = (document.getElementById("seat-preference-return") && document.getElementById("seat-preference-return").value) || "";
    }
    bookingState.specialNeeds = (document.getElementById("special-needs-input") && document.getElementById("special-needs-input").value) || "";

    var f = bookingState.flight;
    var rf = bookingState.returnFlight;
    var routes = flightsData.routes || [];
    var rOut = (f && routes[f.routeIndex]) ? routes[f.routeIndex] : {};
    var rRet = (rf && routes[rf.routeIndex]) ? routes[rf.routeIndex] : {};
    var routeStr = (rOut.fromCity || "") + " – " + (rOut.toCity || "") + ", " + (f ? f.depTime : "");
    if (rf) {
      routeStr += " · Dönüş: " + (rRet.fromCity || "") + " – " + (rRet.toCity || "") + ", " + formatDate(rf.date) + " " + rf.depTime;
    }
    var passengersCopy = (bookingState.passengers || []).slice(0, bookingState.passengerCount || 1).map(function (p) {
      return { firstName: p.firstName || "", lastName: p.lastName || "", email: p.email || "", phone: p.phone || "" };
    });
    var ticket = {
      id: "TKT-" + Date.now(),
      bookingRef: generatePNR(),
      routeSummary: routeStr,
      departureDate: f ? f.date : "",
      departureDateFormatted: f ? formatDate(f.date) : "",
      flightId: f ? f.id : "",
      returnFlightId: rf ? rf.id : null,
      returnDateFormatted: rf ? formatDate(rf.date) : null,
      passengers: passengersCopy,
      baggageOption: bookingState.baggageOption || "cabin",
      seatPreference: bookingState.seatPreference || "",
      returnBaggageOption: bookingState.returnBaggageOption || "cabin",
      returnSeatPreference: bookingState.returnSeatPreference || "",
      specialNeeds: bookingState.specialNeeds || "",
      freeCancellation: !!bookingState.freeCancellation,
      totalPrice: bookingState.totalPrice || 0,
      createdAt: new Date().toISOString(),
      expired: false
    };
    ticket.expired = isExpired(ticket.departureDate);

    var tickets = getTickets();
    if (!Array.isArray(tickets)) tickets = [];
    tickets.unshift(ticket);
    saveTickets(tickets);

    renderConfirmation(ticket);
    setPage("confirmation");
    showSection("page-confirmation");
  }

  function initNav() {
    document.querySelectorAll(".nav-link").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        setPage(a.getAttribute("data-page") || "home");
      });
    });
    var logoLink = document.getElementById("logo-link");
    if (logoLink) {
      logoLink.addEventListener("click", function (e) {
        e.preventDefault();
        var p = (window.location.pathname || "").replace(/\/$/, "") || "/";
        if (p === "" || p === "/" || p === "/index.html") {
          window.location.reload();
        } else {
          window.location.href = "/";
        }
      });
    }
  }

  function initDisclaimer() {
    try {
      if (sessionStorage.getItem("thy_disclaimer_seen")) return;
    } catch (err) { /* ignore */ }
    var overlay = document.getElementById("disclaimer-overlay");
    var closeBtn = document.getElementById("disclaimer-close");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    function closeDisclaimer() {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      try {
        sessionStorage.setItem("thy_disclaimer_seen", "1");
      } catch (err) { /* ignore */ }
    }
    if (closeBtn) closeBtn.addEventListener("click", closeDisclaimer);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeDisclaimer();
    });
  }

  function initAuthorPopup() {
    var btn = document.getElementById("nav-author");
    var overlay = document.getElementById("author-overlay");
    var closeBtn = document.getElementById("author-close");
    if (!btn || !overlay) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
    });
    function closeAuthor() {
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
    }
    if (closeBtn) closeBtn.addEventListener("click", closeAuthor);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeAuthor();
    });
  }

  var FLIGHT_DATE_MIN = "2026-03-19";
  var FLIGHT_DATE_MAX = "2026-04-19";

  function getDefaultDepartureDate() {
    var today = new Date();
    var y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate();
    var iso = y + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
    if (iso < FLIGHT_DATE_MIN) return FLIGHT_DATE_MIN;
    if (iso > FLIGHT_DATE_MAX) return FLIGHT_DATE_MAX;
    return iso;
  }

  function initBookingFlow() {
    var fieldReturn = document.getElementById("field-return");
    document.querySelectorAll(".tabs .tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".tabs .tab").forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        var isOneWay = (tab.getAttribute("data-trip") || "") === "oneway";
        if (fieldReturn) fieldReturn.style.display = isOneWay ? "none" : "";
      });
    });

    var depInput = document.getElementById("input-departure-date");
    var retInput = document.getElementById("input-return-date");
    if (depInput && retInput) {
      depInput.min = FLIGHT_DATE_MIN;
      depInput.max = FLIGHT_DATE_MAX;
      if (!depInput.value) {
        depInput.value = getDefaultDepartureDate();
      }
      retInput.min = depInput.value || FLIGHT_DATE_MIN;
      retInput.max = FLIGHT_DATE_MAX;
      if (!retInput.value || retInput.value < retInput.min) {
        retInput.value = retInput.min;
      }
      if (retInput.value > FLIGHT_DATE_MAX) retInput.value = FLIGHT_DATE_MAX;
      depInput.addEventListener("change", function () {
        if (retInput.value && retInput.value < depInput.value) retInput.value = depInput.value;
        retInput.min = depInput.value;
      });
    }

    document.getElementById("btn-search").addEventListener("click", function () {
      var fromInput = document.getElementById("input-from");
      var toInput = document.getElementById("input-to");
      var fromText = (fromInput && fromInput.value || "").trim();
      var toText = (toInput && toInput.value || "").trim();
      if (fromText && !resolveAirportCode(fromText)) {
        alert("Nereden: Geçerli bir şehir veya havalimanı kodu girin (örn. İstanbul, IST).");
        return;
      }
      if (toText && !resolveAirportCode(toText)) {
        alert("Nereye: Geçerli bir şehir veya havalimanı kodu girin (örn. Ankara, ESB).");
        return;
      }
      bookingState.flight = null;
      bookingState.returnFlight = null;
      renderFlightList();
      document.getElementById("booking-card").classList.add("hidden");
      document.getElementById("hero-booking").classList.add("hidden");
      setPage("flight-list");
      showSection("page-flight-list");
    });

    document.getElementById("btn-back-search").addEventListener("click", function () {
      if (bookingState.selectingReturnFlight) {
        renderFlightList();
      } else {
        showBookingCard();
      }
    });

    document.getElementById("btn-back-to-flights").addEventListener("click", function () {
      setPage("flight-list");
      showSection("page-flight-list");
      updateBookingTotalBar("page-flight-list");
    });

    document.getElementById("btn-to-baggage").addEventListener("click", function () {
      var fields = document.querySelectorAll("#passenger-fields input[data-field][required]");
      var empty = [];
      fields.forEach(function (inp) {
        if (!inp.value.trim()) {
          var label = (inp.closest(".field") && inp.closest(".field").querySelector("label")) ? inp.closest(".field").querySelector("label").textContent.replace(/\s*\*\s*$/, "").trim() : "Alan";
          if (empty.indexOf(label) === -1) empty.push(label);
        }
      });
      if (empty.length > 0) {
        alert("Lütfen zorunlu alanları doldurun: " + empty.join(", "));
        return;
      }
      collectPassengers();
      bookingState.baseFlightTotal = bookingState.totalPrice || 0;
      var returnWrap = document.getElementById("baggage-seat-return-wrap");
      if (returnWrap) returnWrap.classList.toggle("hidden", !bookingState.returnFlight);
      setPage("baggage-seat");
      showSection("page-baggage-seat");
      updateBaggageSeatTotal();
    });

    document.getElementById("btn-back-to-passenger").addEventListener("click", function () {
      setPage("passenger-info");
      showSection("page-passenger");
      updateBookingTotalBar("page-passenger");
    });

    ["baggage-option", "seat-preference", "baggage-option-return", "seat-preference-return"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", function () {
        updateBaggageSeatTotal();
        updateBookingTotalBar("page-baggage-seat");
      });
    });

    document.getElementById("btn-to-special").addEventListener("click", function () {
      bookingState.baggageOption = (document.getElementById("baggage-option") && document.getElementById("baggage-option").value) || "cabin";
      bookingState.seatPreference = (document.getElementById("seat-preference") && document.getElementById("seat-preference").value) || "";
      if (bookingState.returnFlight) {
        bookingState.returnBaggageOption = (document.getElementById("baggage-option-return") && document.getElementById("baggage-option-return").value) || "cabin";
        bookingState.returnSeatPreference = (document.getElementById("seat-preference-return") && document.getElementById("seat-preference-return").value) || "";
      }
      bookingState.totalPrice = (bookingState.baseFlightTotal != null ? bookingState.baseFlightTotal : bookingState.totalPrice) + getBaggageSeatExtras();
      setPage("special-needs");
      showSection("page-special-needs");
    });

    document.getElementById("btn-back-to-baggage").addEventListener("click", function () {
      var returnWrap = document.getElementById("baggage-seat-return-wrap");
      if (returnWrap) returnWrap.classList.toggle("hidden", !bookingState.returnFlight);
      setPage("baggage-seat");
      showSection("page-baggage-seat");
      updateBookingTotalBar("page-baggage-seat");
    });

    document.getElementById("btn-to-lastcheck").addEventListener("click", function () {
      bookingState.specialNeeds = (document.getElementById("special-needs-input") && document.getElementById("special-needs-input").value) || "";
      renderLastCheck();
      var cb = document.getElementById("free-cancellation-checkbox");
      if (cb) cb.checked = !!bookingState.freeCancellation;
      setPage("lastcheck");
      showSection("page-lastcheck");
      updateBookingTotalBar("page-lastcheck");
    });

    document.getElementById("free-cancellation-checkbox").addEventListener("change", function () {
      var checked = this.checked;
      if (checked) {
        bookingState.totalPrice = (bookingState.totalPrice || 0) + FREE_CANCELLATION_FEE;
        bookingState.freeCancellation = true;
      } else {
        bookingState.totalPrice = Math.max(0, (bookingState.totalPrice || 0) - FREE_CANCELLATION_FEE);
        bookingState.freeCancellation = false;
      }
      renderLastCheck();
      updateBookingTotalBar("page-lastcheck");
    });

    document.getElementById("btn-back-to-special").addEventListener("click", function () {
      setPage("special-needs");
      showSection("page-special-needs");
      updateBookingTotalBar("page-special-needs");
    });

    document.getElementById("btn-to-payment").addEventListener("click", function () {
      renderPaymentSummary();
      setPage("payment");
      showSection("page-payment");
    });

    document.getElementById("btn-back-to-lastcheck").addEventListener("click", function () {
      var cb = document.getElementById("free-cancellation-checkbox");
      if (cb) cb.checked = !!bookingState.freeCancellation;
      setPage("lastcheck");
      showSection("page-lastcheck");
      updateBookingTotalBar("page-lastcheck");
    });

    document.getElementById("btn-pay").addEventListener("click", onPay);

    document.getElementById("btn-back-home").addEventListener("click", function () {
      bookingState = { flight: null, returnFlight: null, selectingReturnFlight: false, passengerCount: 1, passengers: [], baggageOption: "cabin", seatPreference: "", returnBaggageOption: "cabin", returnSeatPreference: "", specialNeeds: "", totalPrice: 0, baseFlightTotal: 0, freeCancellation: false };
      setPage("my-tickets");
    });

    var editCancel = document.getElementById("ticket-edit-cancel");
    var editSave = document.getElementById("ticket-edit-save");
    if (editCancel) editCancel.addEventListener("click", closeTicketEdit);
    if (editSave) editSave.addEventListener("click", saveTicketEdit);

    var deleteCancelBtn = document.getElementById("delete-ticket-cancel");
    var deleteConfirmBtn = document.getElementById("delete-ticket-confirm");
    if (deleteCancelBtn) deleteCancelBtn.addEventListener("click", closeDeleteTicketModal);
    if (deleteConfirmBtn) deleteConfirmBtn.addEventListener("click", confirmDeleteTicket);
  }

  function initChat() {
    var panel = document.getElementById("chat-panel");
    var toggle = document.getElementById("chat-toggle");
    var closeBtn = document.getElementById("chat-close");
    var resizeHandle = document.getElementById("chat-resize-handle");
    var messagesEl = document.getElementById("chat-messages");
    var inputEl = document.getElementById("chat-input");
    var sendBtn = document.getElementById("chat-send");

    var minW = 280, maxW = Math.min(520, (window.innerWidth || 0) - 32);
    var minH = 300, maxH = (window.innerHeight || 0) - 80;
    if (resizeHandle && panel) {
      resizeHandle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        var startX = e.clientX, startY = e.clientY;
        var startW = panel.offsetWidth, startH = panel.offsetHeight;
        function onMove(e) {
          var dw = startX - e.clientX, dh = startY - e.clientY;
          var w = Math.max(minW, Math.min(maxW, startW + dw));
          var h = Math.max(minH, Math.min(maxH, startH + dh));
          panel.style.width = w + "px";
          panel.style.height = h + "px";
        }
        function onUp() {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    var welcomeShown = false;
    var chatHistory = []; // son 4 mesaj (2 user + 2 assistant)
    function openChat() {
      panel.classList.remove("hidden");
      if (!welcomeShown && messagesEl && messagesEl.children.length === 0) {
        welcomeShown = true;
        addMessage("Merhaba, bilet alma ve yolculuk sürecinizde size rehberlik eden yardımcı asistanınızım. Hangi sayfada olursanız olun adım adım yardımcı olabilirim: uçuş seçimi, yolcu bilgileri, bagaj, koltuk, iade/değişiklik veya ekrandaki işlemler. Nasıl yardımcı olmamı istersiniz?", false);
      }
    }
    function closeChat() { panel.classList.add("hidden"); }

    toggle.addEventListener("click", function () {
      if (panel.classList.contains("hidden")) openChat(); else closeChat();
    });
    closeBtn.addEventListener("click", closeChat);

    function addMessage(text, isUser) {
      var wrap = document.createElement("div");
      wrap.className = "msg-wrap " + (isUser ? "msg-wrap-user" : "msg-wrap-bot");
      var avatar = document.createElement("div");
      avatar.className = "msg-avatar " + (isUser ? "msg-avatar-user" : "msg-avatar-bot");
      var img = document.createElement("img");
      img.src = isUser ? "/img/user-pp.png" : "/img/mini-logo.jpeg";
      img.alt = "";
      img.className = "msg-avatar-img";
      avatar.appendChild(img);
      var bubble = document.createElement("div");
      bubble.className = "msg " + (isUser ? "user" : "bot");
      bubble.textContent = text;
      wrap.appendChild(avatar);
      wrap.appendChild(bubble);
      messagesEl.appendChild(wrap);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    sendBtn.addEventListener("click", sendMessage);
    inputEl.addEventListener("keydown", function (e) { if (e.key === "Enter") sendMessage(); });

    function sendMessage() {
      var msg = inputEl.value.trim();
      if (!msg) return;
      addMessage(msg, true);
      inputEl.value = "";
      sendBtn.disabled = true;
      fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          current_page: currentPage || null,
          history: chatHistory.slice(-4),
          current_date: getCurrentDateForChat(),
          booking_context: getBookingContextForChat() || null,
          search_context: getSearchContextForChat() || null
        })
      })
        .then(function (r) { if (!r.ok) throw new Error(r.statusText); return r.json(); })
        .then(function (data) {
          var reply = (data.reply || "Yanıt alınamadı.").replace(/\*\*/g, "");
          addMessage(reply, false);
          chatHistory.push({ role: "user", content: msg });
          chatHistory.push({ role: "assistant", content: reply });
          if (chatHistory.length > 4) chatHistory = chatHistory.slice(-4);
        })
        .catch(function (err) { addMessage("Bağlantı hatası: " + err.message, false); })
        .finally(function () { sendBtn.disabled = false; });
    }
  }

  function fillAirportDropdowns() {
    var airports = (airportsData.airports || []);
    var fromInput = document.getElementById("input-from");
    var toInput = document.getElementById("input-to");
    var i, a;
    if (fromInput) {
      for (i = 0; i < airports.length; i++) { a = airports[i]; if (a.code === "IST") { fromInput.value = airportLabel(a); break; } }
    }
    if (toInput) {
      for (i = 0; i < airports.length; i++) { a = airports[i]; if (a.code === "ESB") { toInput.value = airportLabel(a); break; } }
    }
  }

  function filterAirports(query) {
    var airports = (airportsData.airports || []);
    var q = (query || "").trim().toLowerCase();
    if (!q) return airports;
    return airports.filter(function (a) {
      var label = airportLabel(a).toLowerCase();
      return label.indexOf(q) !== -1 || a.code.toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderAutocompleteList(listEl, items, inputEl) {
    if (!listEl || !inputEl) return;
    listEl.innerHTML = "";
    if (!items || items.length === 0) {
      listEl.classList.add("hidden");
      return;
    }
    items.forEach(function (a) {
      var div = document.createElement("div");
      div.className = "autocomplete-item";
      div.setAttribute("role", "option");
      div.textContent = a.city + " ";
      var codeSpan = document.createElement("span");
      codeSpan.className = "autocomplete-code";
      codeSpan.textContent = "(" + a.code + ")";
      div.appendChild(codeSpan);
      div.dataset.value = airportLabel(a);
      div.dataset.code = a.code;
      div.addEventListener("click", function () {
        inputEl.value = div.dataset.value;
        listEl.classList.add("hidden");
        inputEl.focus();
      });
      listEl.appendChild(div);
    });
    listEl.classList.remove("hidden");
  }

  function initAirportAutocomplete() {
    var fromInput = document.getElementById("input-from");
    var toInput = document.getElementById("input-to");
    var fromList = document.getElementById("suggestions-from");
    var toList = document.getElementById("suggestions-to");
    function attach(input, list) {
      if (!input || !list) return;
      function show() {
        var q = input.value.trim();
        var items = filterAirports(q);
        renderAutocompleteList(list, items, input);
      }
      function hide() {
        setTimeout(function () { list.classList.add("hidden"); }, 150);
      }
      input.addEventListener("focus", show);
      input.addEventListener("input", show);
      input.addEventListener("blur", hide);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          list.classList.add("hidden");
        }
      });
    }
    attach(fromInput, fromList);
    attach(toInput, toList);
  }

  function loadAirports() {
    fetch("/data/airports.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        airportsData = data || { airports: [] };
        fillAirportDropdowns();
        initAirportAutocomplete();
      })
      .catch(function () {
        airportsData = { airports: [] };
        fillAirportDropdowns();
        initAirportAutocomplete();
      });
  }

  function loadFlights() {
    fetch("/data/flights.json")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        flightsData = data || { routes: [], flights: [] };
        renderFlightList();
      })
      .catch(function () { flightsData = { routes: [], flights: [] }; });
  }

  loadAirports();
  loadFlights();
  bindFlightSelect();
  initNav();
  initDisclaimer();
  initAuthorPopup();
  initBookingFlow();
  initChat();

  setPage("home");
})();
