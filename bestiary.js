/* Bestiary liste sayfaları — sütun başlığına tıklayarak sıralama.
   .creature-table-head içindeki .th-cell.sortable öğelerine tıklanınca
   .creature-grid içindeki .creature-card satırlarını data-* attribute'larına
   göre yeniden sıralar (aynı sütuna tekrar tıklamak yönü tersine çevirir). */
function initCreatureTableSort() {
  var head = document.querySelector('.creature-table-head');
  var grid = document.querySelector('.creature-grid');
  if (!head || !grid) return;

  var state = { key: 'name', dir: 'asc' };

  function apply() {
    var rows = Array.prototype.slice.call(grid.children);
    rows.sort(function (a, b) {
      var av = a.dataset[state.key];
      var bv = b.dataset[state.key];
      var cmp;
      if (state.key === 'cr') {
        cmp = parseFloat(av) - parseFloat(bv);
      } else {
        cmp = av.localeCompare(bv, 'tr');
      }
      return state.dir === 'asc' ? cmp : -cmp;
    });
    rows.forEach(function (row) { grid.appendChild(row); });

    head.querySelectorAll('.th-cell.sortable').forEach(function (th) {
      var active = th.dataset.sort === state.key;
      th.classList.toggle('active', active);
      var arrow = th.querySelector('.th-sort-arrow');
      if (arrow) arrow.textContent = active ? (state.dir === 'asc' ? '▲' : '▼') : '';
    });
  }

  head.querySelectorAll('.th-cell.sortable').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.dataset.sort;
      if (state.key === key) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.key = key;
        state.dir = 'asc';
      }
      apply();
    });
  });

  apply();
}

/* Stat-block detay sayfalarında portre görseline tıklayınca
   tam boyutlu açılır pencerede gösterir (karakter sayfalarındaki
   modal deseniyle aynı ruhta, tek görsel için basitleştirilmiş). */
function initPortraitLightbox() {
  var portrait = document.querySelector('.statblock-portrait');
  if (!portrait) return;

  var overlay = document.createElement('div');
  overlay.className = 'portrait-modal';
  overlay.innerHTML = '<span class="portrait-modal-close">&times;</span><img>';
  document.body.appendChild(overlay);
  var overlayImg = overlay.querySelector('img');

  function open() {
    overlayImg.src = portrait.currentSrc || portrait.src;
    overlayImg.alt = portrait.alt;
    overlay.classList.add('open');
  }
  function close() {
    overlay.classList.remove('open');
  }

  portrait.addEventListener('click', open);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initCreatureTableSort();
  initPortraitLightbox();
});
