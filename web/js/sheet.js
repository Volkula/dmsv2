(function () {
  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function sign(n) {
    const v = Math.round(Number(n) || 0);
    return v > 0 ? "+" + v : String(v);
  }

  function html(hero, edit) {
    const who = hero || {};
    function on(key) {
      if (edit === true) return true;
      return !!(edit && edit[key]);
    }
    const face = who.portrait || "/tokens/pawn.svg";
    const stats = (Array.isArray(who.stats) ? who.stats : []).filter(Boolean).map(function (stat) {
      const roll = '<button type="button" data-roll="stat" data-name="' + esc(stat.name || stat.id) + '" data-mod="' + esc(stat.mod || 0) + '"><b>' + esc(stat.name || stat.id) + '</b><em>' + esc(sign(stat.mod)) + "</em></button>";
      const score = on("stats") ? '<input data-score="' + esc(stat.id) + '" type="number" min="1" max="30" value="' + esc(stat.score) + '">' : "<span>" + esc(stat.score) + "</span>";
      return '<div class="sheet-stat-cell">' + roll + score + "</div>";
    }).join("");
    const skills = (Array.isArray(who.skills) ? who.skills : []).filter(Boolean).map(function (skill) {
      const roll = '<button type="button" data-roll="skill" data-name="' + esc(skill.name) + '" data-mod="' + esc(skill.bonus || 0) + '">' + esc(skill.name) + "</button>";
      const bonus = on("skills")
        ? '<input data-skill="' + esc(skill.name) + '" type="number" min="-30" max="30" value="' + esc(skill.bonus || 0) + '">'
        : "<em>" + esc(sign(skill.bonus)) + "</em>";
      return '<div class="sheet-skill-row">' + roll + bonus + "</div>";
    }).join("");
    const attacks = (Array.isArray(who.attacks) ? who.attacks : []).filter(Boolean).map(function (hit, index) {
      const roll = '<button type="button" data-roll="hit" data-name="' + esc(hit.name) + '" data-mod="' + esc(hit.bonus || 0) + '" data-dmg="' + esc(hit.damage || "") + '">' + (on("attacks") ? "Бросок" : esc(hit.name) + " " + esc(sign(hit.bonus)) + (hit.damage ? " · " + esc(hit.damage) : "")) + "</button>";
      if (!on("attacks")) return '<div class="sheet-skill-row">' + roll + "</div>";
      return '<div class="sheet-skill-row">' +
        '<input data-hit-name="' + index + '" value="' + esc(hit.name) + '">' +
        '<input data-hit-bonus="' + index + '" type="number" value="' + esc(hit.bonus || 0) + '">' +
        '<input data-hit-dmg="' + index + '" value="' + esc(hit.damage || "") + '">' +
        roll + "</div>";
    }).join("");
    const name = on("name")
      ? '<input data-name-field value="' + esc(who.name || "") + '">'
      : "<b>" + esc(who.name || "Персонаж") + "</b>";
    const title = on("name")
      ? '<input data-title-field value="' + esc(who.title || "") + '">'
      : "<small>" + esc(who.title || "") + "</small>";
    const hp = on("hp")
      ? '<label>Хиты <input data-hp type="number" min="0" max="999" value="' + esc(who.hp == null ? 0 : who.hp) + '"></label><label>из <input data-hp-max type="number" min="0" max="999" value="' + esc(who.hpMax || 0) + '"></label>'
      : '<p class="sheet-hp">Хиты ' + esc(who.hp == null ? "—" : who.hp) + " / " + esc(who.hpMax || "—") + "</p>";
    const ac = on("ac")
      ? '<label>КД <input data-ac type="number" min="0" max="40" value="' + esc(who.ac || 0) + '"></label>'
      : "<span>КД " + esc(who.ac == null ? "—" : who.ac) + "</span>";
    const init = on("init")
      ? '<label>Инициатива <input data-init type="number" min="-30" max="30" value="' + esc(who.init || 0) + '"></label>'
      : "<span>инициатива " + esc(sign(who.init || 0)) + "</span>";
    const speed = on("speed")
      ? '<label>Скорость <input data-speed value="' + esc(who.speed || "") + '"></label>'
      : (who.speed ? "<span>" + esc(who.speed) + "</span>" : "");
    const line = '<div class="sheet-vitals">' + ac + init + speed + "</div>";
    return '<div class="sheet-card">' +
      '<header><img alt="" src="' + esc(face) + '"><div>' + name + title + "</div></header>" +
      '<div class="sheet-vitals">' + hp + "</div>" +
      line +
      (stats ? '<div class="sheet-stats">' + stats + "</div>" : "") +
      (skills ? '<div class="sheet-skills"><h3>Навыки</h3>' + skills + "</div>" : "") +
      (attacks ? '<div class="sheet-skills"><h3>Атаки</h3>' + attacks + "</div>" : "") +
      "</div>";
  }

  window.ShirmoSheet = { html: html, pawn: "/tokens/pawn.svg", sign: sign };
})();
