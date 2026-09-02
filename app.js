const categories = [
  {
    name: 'Softdrinks', size: '0,33 l', products: [
      ['Fritz Kola', 4.0], ['Fritz Kola Zero', 4.0], ['Fritz Orange', 4.0], ['Fritz Zitrone', 4.0],
      ['Fritz Bio-Apfelschorle', 4.5], ['Fritz Bio-Rhabarberschorle', 4.5], ['ClimAid Stil', 3.5], ['ClimAid Sprudelnd', 3.5]
    ]
  },
  {
    name: 'Red Bull', size: '0,33 l', products: [
      ['Red Bull Energy Drink', 5.0], ['Red Bull Zero', 5.0], ['Red Bull White Edition', 5.0]
    ]
  },
  {
    name: 'Bier', size: '0,33 l / 0,4 l', products: [
      ['Anheuser-Busch (vom Fass)', 5.0], ['San Miguel (vom Fass)', 5.0], ['Corona', 4.5], ['Corona Zero', 4.5]
    ]
  },
  {
    name: 'Aperitif', size: '0,3 l', products: [
      ['Aperol Spritz', 9.0], ['Red Bull Spritz', 8.0]
    ]
  },
  {
    name: 'Wein', size: '0,2 l / 0,7 l', products: [
      ['Weißwein 0,2 l', 8.0], ['Weißwein 0,7 l', 35.0], ['Rosé 0,2 l', 8.0], ['Rosé 0,7 l', 28.0]
    ]
  },
  {
    name: 'Longdrinks', size: '0,3 l', products: [
      ['Red Bull Vodka', 9.0]
    ]
  },
  {
    name: 'Pfand', size: 'Glas & Flaschen', products: [
      ['Pfand', 2.0, 'deposit'], ['Pfand Rückgabe', -2.0, 'refund']
    ]
  }
];

const cart = new Map();
let discountActive = false;

const euro = (value) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
const idFor = (name) => name.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '');

const productGroups = document.getElementById('productGroups');
const categoryTabs = document.getElementById('categoryTabs');
const cartItems = document.getElementById('cartItems');
const subtotalEl = document.getElementById('subtotal');
const discountRow = document.getElementById('discountRow');
const discountValue = document.getElementById('discountValue');
const totalEl = document.getElementById('total');
const mobileTotal = document.getElementById('mobileTotal');
const mobileCount = document.getElementById('mobileCount');
const studentDiscount = document.getElementById('studentDiscount');
const cartPanel = document.querySelector('.cart-panel');

function renderCatalog() {
  categoryTabs.innerHTML = categories.map((category, index) => `
    <button class="category-tab ${index === 0 ? 'active' : ''}" type="button" data-target="${idFor(category.name)}">${category.name}</button>
  `).join('');

  productGroups.innerHTML = categories.map(category => `
    <section class="product-group" id="${idFor(category.name)}">
      <h2>${category.name} <span>${category.size}</span></h2>
      <div class="product-grid">
        ${category.products.map(([name, price, type]) => `
          <button class="product-button ${type || ''}" type="button" data-name="${name}" data-price="${price}">
            <span class="name">${name}</span>
            <span class="price">${price < 0 ? '−' : ''}${euro(Math.abs(price))}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');

  productGroups.querySelectorAll('.product-button').forEach(button => {
    button.addEventListener('click', () => {
      addItem(button.dataset.name, Number(button.dataset.price));
      flash(button.dataset.name);
    });
  });

  categoryTabs.querySelectorAll('.category-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      categoryTabs.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function addItem(name, price) {
  const existing = cart.get(name) || { name, price, qty: 0 };
  existing.qty += 1;
  cart.set(name, existing);
  renderCart();
}

function changeQty(name, delta) {
  const item = cart.get(name);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart.delete(name);
  else cart.set(name, item);
  renderCart();
}

function renderCart() {
  const items = [...cart.values()];
  if (!items.length) {
    cartItems.innerHTML = '<div class="empty-state">Noch nichts ausgewählt.</div>';
  } else {
    cartItems.innerHTML = items.map(item => `
      <div class="cart-line">
        <div>
          <div class="line-name">${item.name}</div>
          <div class="cart-line-main">
            <div class="qty-controls">
              <button type="button" data-action="minus" data-name="${item.name}" aria-label="${item.name} verringern">−</button>
              <strong>${item.qty}×</strong>
              <button type="button" data-action="plus" data-name="${item.name}" aria-label="${item.name} erhöhen">+</button>
            </div>
            <small>${euro(item.price)} / Stück</small>
          </div>
        </div>
        <div class="line-price">${euro(item.price * item.qty)}</div>
      </div>
    `).join('');

    cartItems.querySelectorAll('[data-action]').forEach(button => {
      button.addEventListener('click', () => changeQty(button.dataset.name, button.dataset.action === 'plus' ? 1 : -1));
    });
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discountableSubtotal = items
    .filter(item => item.name !== 'Pfand' && item.name !== 'Pfand Rückgabe')
    .reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = discountActive ? Math.max(0, discountableSubtotal) * 0.25 : 0;
  const total = subtotal - discount;
  const count = items.reduce((sum, item) => sum + item.qty, 0);

  subtotalEl.textContent = euro(subtotal);
  discountValue.textContent = `−${euro(discount)}`;
  discountRow.classList.toggle('hidden', !discountActive);
  totalEl.textContent = euro(total);
  mobileTotal.textContent = euro(total);
  mobileCount.textContent = count;
}

function resetOrder() {
  cart.clear();
  discountActive = false;
  studentDiscount.classList.remove('active');
  studentDiscount.setAttribute('aria-pressed', 'false');
  cartPanel?.classList.remove('open');
  renderCart();
}

function flash(name) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = `${name} hinzugefügt`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 650);
}

studentDiscount.addEventListener('click', () => {
  discountActive = !discountActive;
  studentDiscount.classList.toggle('active', discountActive);
  studentDiscount.setAttribute('aria-pressed', String(discountActive));
  renderCart();
});

document.getElementById('clearCart').addEventListener('click', resetOrder);
document.getElementById('newOrder').addEventListener('click', resetOrder);
document.getElementById('mobileCartButton').addEventListener('click', () => cartPanel.classList.toggle('open'));

renderCatalog();
renderCart();
