/* Bestiary liste sayfaları için sıralama mantığı.
   .creature-grid içindeki .creature-card öğelerini
   data-name / data-cr attribute'larına göre yeniden sıralar. */
function sortCreatures(key) {
  var grid = document.querySelector('.creature-grid');
  if (!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  cards.sort(function (a, b) {
    if (key === 'cr') {
      return parseFloat(a.dataset.cr) - parseFloat(b.dataset.cr);
    }
    return a.dataset.name.localeCompare(b.dataset.name, 'tr');
  });
  cards.forEach(function (card) { grid.appendChild(card); });
  document.querySelectorAll('.sort-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.dataset.sort === key);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.sort-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { sortCreatures(btn.dataset.sort); });
  });
});
