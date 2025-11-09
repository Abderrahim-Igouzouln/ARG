
    // --- FIREBASE IMPORTS ---
    import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
    import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
    import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
    import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
    // Configuration et initialisation (Variables globales MANDATORY)
    setLogLevel('Debug');
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-argan-app';
    const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
    let db;
    let auth;
    let userId = 'loading'; // L'UID de l'utilisateur ou un ID temporaire
    let isAuthReady = false;
    // Données globales
    let members = JSON.parse(localStorage.getItem("members")) || [];
    let purchases = JSON.parse(localStorage.getItem("purchases")) || [];
    let production = JSON.parse(localStorage.getItem("production")) || [];
    let sales = JSON.parse(localStorage.getItem("sales")) || [];
    let stock = JSON.parse(localStorage.getItem("stock")) || [];
    let accounting = JSON.parse(localStorage.getItem("accounting")) || [];
    // Graphiques
    let monthlyChartInstance = null;
    let purchasesChartInstance = null;
    let productionChartInstance = null;
    let accountingChartInstance = null;
    // Fonction utilitaire pour l'initialisation de Firebase
    async function initializeFirebase() {
        try {
            if (Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config non disponible. L'application ne fonctionnera pas sans BDD.");
                return;
            }
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);
            // Authentification
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    userId = user.uid;
                    console.log("Authentification réussie. User ID:", userId);
                } else {
                    // S'authentifier avec le token personnalisé ou de manière anonyme
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        // En cas d'échec (token non défini), utiliser l'authentification anonyme pour le test
                        await signInAnonymously(auth);
                        userId = auth.currentUser.uid;
                    }
                }
                document.getElementById('current-user-id').textContent = userId;
                document.getElementById('app-id-display').value = appId;
                isAuthReady = true;
                // Démarrer les listeners après l'authentification
                startRealtimeListeners();
            });
        } catch (error) {
            console.error("Erreur lors de l'initialisation de Firebase:", error);
        }
    }
    /**
     * Construit le chemin de la collection Firestore.
     * Toutes les collections sont privées par défaut.
     */
    function getCollectionPath(collectionName) {
        return `artifacts/${appId}/users/${userId}/${collectionName}`;
    }
    // --- GESTION DES LISTENERS REALTIME (ON SNAPSHOT) ---
    function startRealtimeListeners() {
        if (!db || !isAuthReady) return;
        // 1. Membres
        onSnapshot(collection(db, getCollectionPath('members')), (snapshot) => {
            members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMembers();
        }, (error) => { console.error("Erreur listening members:", error); });
        // 2. Achats
        onSnapshot(collection(db, getCollectionPath('purchases')), (snapshot) => {
            purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            purchases.forEach(p => p.total = p.quantity * p.price);
            renderPurchases();
            updateDashboard();
            drawMonthlyChart();
            drawPurchasesChart();
        }, (error) => { console.error("Erreur listening purchases:", error); });
        // 3. Production
        onSnapshot(collection(db, getCollectionPath('production')), (snapshot) => {
            production = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderProduction();
            updateDashboard();
            drawProductionChart();
        }, (error) => { console.error("Erreur listening production:", error); });
        // 4. Ventes
        onSnapshot(collection(db, getCollectionPath('sales')), (snapshot) => {
            sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            sales.forEach(s => s.total = s.quantity * s.unitPrice);
            renderSales();
            updateDashboard();
            drawMonthlyChart();
        }, (error) => { console.error("Erreur listening sales:", error); });
        // 5. Stock
        onSnapshot(collection(db, getCollectionPath('stock')), (snapshot) => {
            stock = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderStock();
            checkLowStock();
        }, (error) => { console.error("Erreur listening stock:", error); });
        // 6. Comptabilité
        onSnapshot(collection(db, getCollectionPath('accounting')), (snapshot) => {
            accounting = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderAccounting();
            updateAccountingStats();
            drawAccountingChart();
        }, (error) => { console.error("Erreur listening accounting:", error); });
        // 7. Paramètres globaux (pour le nom de l'asso, stockés en public)
        onSnapshot(doc(db, `artifacts/${appId}/public/data/settings/global`), (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                document.getElementById('association-name').value = data.name || '';
                document.getElementById('association-phone').value = data.phone || '';
                document.getElementById('association-address').value = data.address || '';
            }
        }, (error) => { console.error("Erreur listening global settings:", error); });
    }
    // --- FONCTIONS UTILS ET UI ---
    window.showPage = function (pageId) {
        document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`.menu-item[data-page="${pageId}"]`).classList.add('active');
    }
    window.openModal = function (modalId) {
        document.getElementById(modalId).style.display = 'flex';
    }
    window.closeModal = function (modalId) {
        document.getElementById(modalId).style.display = 'none';
    }
    // Gestion de la navigation
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            window.showPage(item.getAttribute('data-page'));
        });
    });
    // Afficher la page Dashboard au chargement
    window.addEventListener('load', () => {
        initializeFirebase();
        window.showPage('dashboard');
        // Initialiser les filtres/recherches
        document.getElementById('member-search').addEventListener('input', renderMembers);
        document.getElementById('member-role-filter').addEventListener('change', renderMembers);
        document.getElementById('purchase-search').addEventListener('input', renderPurchases);
        document.getElementById('sale-search').addEventListener('input', renderSales);
        document.getElementById('accounting-search').addEventListener('input', renderAccounting);
        document.getElementById('accounting-filter').addEventListener('change', renderAccounting);
    });
    // Formatage monétaire
    function formatCurrency(amount) {
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'MAD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }
    // Formatage date
    function formatDate(dateString) {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString('fr-FR');
    }
    // Message Box (remplacement d'alert/confirm)
    let messageBoxResolve;
    window.showMessageBox = function (title, text, type = 'alert', confirmText = 'Confirmer', cancelText = 'Annuler') {
        return new Promise(resolve => {
            messageBoxResolve = resolve;
            document.getElementById('message-box-title').textContent = title;
            document.getElementById('message-box-text').textContent = text;
            const actions = document.getElementById('message-box-actions');
            actions.innerHTML = '';
            if (type === 'confirm') {
                const cancelButton = document.createElement('button');
                cancelButton.className = 'btn btn-secondary';
                cancelButton.textContent = cancelText;
                cancelButton.onclick = () => { closeModal('message-box-modal'); resolve(false); };
                actions.appendChild(cancelButton);
            }
            const confirmButton = document.createElement('button');
            confirmButton.className = type === 'confirm' ? 'btn btn-danger' : 'btn btn-primary';
            confirmButton.textContent = confirmText;
            confirmButton.onclick = () => { closeModal('message-box-modal'); resolve(true); };
            actions.appendChild(confirmButton);
            openModal('message-box-modal');
        });
    }
    // --- FONCTIONS DE MISE À JOUR DU TABLEAU DE BORD ---
    function updateDashboard() {
        // Calcul du stock de fruits (Approvisionnements - Utilisés en production)
        const totalFruitsPurchased = purchases.reduce((sum, p) => sum + p.quantity, 0);
        const totalFruitsUsed = production.reduce((sum, p) => sum + p.fruitsUsed, 0);
        const currentFruitStock = totalFruitsPurchased - totalFruitsUsed;
        // Calcul de l'huile produite
        const totalOilProduced = production.reduce((sum, p) => sum + p.oilProduced, 0);
        // Calcul des finances (ventes = revenus, achats = dépenses)
        const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
        const totalCostOfPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
        // Bénéfice net (simplifié)
        const netProfit = totalRevenue - totalCostOfPurchases;
        document.getElementById('total-fruits').textContent = currentFruitStock.toFixed(2);
        document.getElementById('total-oil').textContent = totalOilProduced.toFixed(2);
        document.getElementById('total-revenue-dashboard').textContent = formatCurrency(totalRevenue);
        document.getElementById('net-profit').textContent = formatCurrency(netProfit);
        // Mettre à jour les informations de stock dans les modals
        document.getElementById('fruit-stock-info').textContent = currentFruitStock.toFixed(2);
        const oilStockItem = stock.find(item => item.item.includes('Huile d\'Argan'));
        document.getElementById('oil-stock-info').textContent = oilStockItem ? oilStockItem.available.toFixed(2) : '0.00';
    }
    function checkLowStock() {
        const notificationsContainer = document.getElementById('notifications-container');
        notificationsContainer.innerHTML = '';
        const lowStockItems = stock.filter(item => item.available < item.minimum);
        if (lowStockItems.length === 0) {
            notificationsContainer.innerHTML = '<p class="text-gray-500">Aucune notification en cours.</p>';
        } else {
            lowStockItems.forEach(item => {
                const div = document.createElement('div');
                div.className = 'notification-item notification-low-stock';
                div.innerHTML = `⚠️ **ALERTE STOCK BAS** : L'article **${item.item}** a atteint son seuil minimum. Quantité disponible: ${item.available} ${item.unit}. (Seuil: ${item.minimum} ${item.unit})`;
                notificationsContainer.appendChild(div);
            });
        }
    }

// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Members
    // --- EXEMPLES PAR DÉFAUT --- début
    if (!localStorage.getItem("members")) {
        const exampleMembers = [
            { id: Date.now().toString() + "1", name: "Fatima Ait Lahcen", role: "Président", phone: "0612345678", date: "2020-05-14" },
            { id: Date.now().toString() + "2", name: "Mohamed El Amrani", role: "Trésorier", phone: "0678123456", date: "2021-09-03" },
            { id: Date.now().toString() + "3", name: "Amina Bouhssous", role: "Secrétaire", phone: "0654872136", date: "2019-11-21" },
            { id: Date.now().toString() + "4", name: "Khadija Ouardi", role: "Membre", phone: "0609876543", date: "2022-02-10" },
            { id: Date.now().toString() + "5", name: "Zahra El Khettabi", role: "Productrice", phone: "0645783021", date: "2023-01-22" },
            { id: Date.now().toString() + "6", name: "Youssef Benjelloun", role: "Membre", phone: "0623456789", date: "2020-08-30" }
        ];

        localStorage.setItem("members", JSON.stringify(exampleMembers));
    }
    function saveLocalMembers() {localStorage.setItem("members", JSON.stringify(members));}
    function loadMembers() {
        const tbody = document.getElementById('members-table');
        tbody.innerHTML = "";

        if (members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-gray-500 py-4">Aucun membre trouvé</td></tr>`;
            return;
        }

        members.forEach(m => {
            tbody.innerHTML += `
                <tr>
                    <td>${m.name}</td>
                    <td><span class="px-2 py-1 text-xs font-semibold rounded-full bg-secondary-color text-white">${m.role}</span></td>
                    <td>${m.phone}</td>
                    <td>${m.date}</td>
                    <td>
                        <button class="text-primary-color hover:text-amber-700" onclick="editMember('${m.id}')">✏️</button>
                        <button class="text-red-600 hover:text-red-800" onclick="deleteMemberFromTable('${m.id}')">🗑️</button>
                    </td>
                </tr>
            `;
        });
    }
    loadMembers();
    // --- EXEMPLES PAR DÉFAUT --- fin

    // --- RENDERING DES PAGES ---
    function renderMembers() {
        const tbody = document.getElementById('members-table');
        const searchValue = document.getElementById('member-search').value.toLowerCase();
        const roleFilter = document.getElementById('member-role-filter').value;
        const filtered = members
            .filter(m => (m.name.toLowerCase().includes(searchValue) || m.role.toLowerCase().includes(searchValue)))
            .filter(m => !roleFilter || m.role === roleFilter);
        tbody.innerHTML = filtered.map(m => `
            <tr>
                <td class="font-medium">${m.name}</td>
                <td><span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">${m.role}</span></td>
                <td>${m.phone}</td>
                <td>${formatDate(m.date)}</td>
                <td class="actions-cell">
                    <button class="text-primary-color hover:text-amber-700" onclick="editMember('${m.id}')">✏️</button>
                    <button class="text-red-600 hover:text-red-800" onclick="deleteMemberFromTable('${m.id}')">🗑️</button>
                </td>
            </tr>
        `).join('');
        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-500 py-4">Aucun membre trouvé.</td></tr>';
        }
    }
    // --- CRUD : SAVE (Ajout/Modification) ---
    window.saveMember = function (event) {
                event.preventDefault();
        const id = document.getElementById('member-id').value;
        const data = {
            name: document.getElementById('member-name').value,
            role: document.getElementById('member-role').value,
            phone: document.getElementById('member-phone').value,
            date: document.getElementById('member-date').value,
            id: id || Date.now().toString() // Generate ID if new member
        };

        // Add to members array
        if (id) {
            const index = members.findIndex(m => m.id === id);
            if (index !== -1) {
                members[index] = data;
            }
        } else {
            members.push(data);
        }

        // Update table
        renderMembers();
        
        // Clear form
        document.getElementById('member-form').reset();
        closeModal('member-modal');

        // Save to Firebase
        saveDocument('members', data, id, null);

    }
    // --- OPEN MODAL (ADD / EDIT) ---
    window.openMemberModal = function (id = null) {
        document.getElementById('member-form').reset();
        document.getElementById('member-id').value = id || '';
        document.getElementById('member-modal-title').textContent = id ? 'Modifier le membre' : 'Ajouter un membre';
        openModal('member-modal');
    }
    window.editMember = function (id) {
        const member = members.find(m => m.id === id);
        if (member) {
            document.getElementById('member-id').value = id;
            document.getElementById('member-name').value = member.name;
            document.getElementById('member-role').value = member.role;
            document.getElementById('member-phone').value = member.phone;
            document.getElementById('member-date').value = member.date;
            openMemberModal(id);
        }
    }
    window.deleteMemberFromTable = async function(id) {
        const member = members.find(m => m.id === id);
        if (!member) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Êtes-vous sûr de vouloir supprimer ${member.name}?`,
            "confirm"
        );

        if (confirmed) {
            // Remove from array
            members = members.filter(m => m.id !== id);
            
            // Update table
            renderMembers();

            // Delete from Firebase
            await deleteDocument('members', id, member.name);
        }
    }   
        // --- INITIAL LOAD ---
renderMembers();
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Achats
    // --- EXEMPLES PAR DÉFAUT --- début
    if (purchases.length === 0) {
        purchases = [
            { id: Date.now().toString() + "1", date: "2025-01-10", supplier: "Fournisseur A", quantity: 50, price: 20, total: 1000 },
            { id: Date.now().toString() + "2", date: "2025-02-15", supplier: "Fournisseur B", quantity: 30, price: 25, total: 750 },
            { id: Date.now().toString() + "3", date: "2025-03-20", supplier: "Fournisseur C", quantity: 40, price: 22, total: 880 },
            { id: Date.now().toString() + "4", date: "2025-04-05", supplier: "Fournisseur D", quantity: 60, price: 18, total: 1080 },
            { id: Date.now().toString() + "5", date: "2025-05-12", supplier: "Fournisseur E", quantity: 25, price: 30, total: 750 },
            { id: Date.now().toString() + "6", date: "2025-06-18", supplier: "Fournisseur F", quantity: 70, price: 19, total: 1330 }
        ];
        localStorage.setItem("purchases", JSON.stringify(purchases));
    }
    function saveLocalPurchases() {localStorage.setItem("purchases", JSON.stringify(purchases));}
    // --- EXEMPLES PAR DÉFAUT --- fin

    // --- OPEN MODAL (ADD / EDIT) ---
    window.openPurchaseModal = function (id = null) {
        document.getElementById('purchase-form').reset();
        document.getElementById('purchase-id').value = id || '';
        openModal('purchase-modal');
    }
    // --- RENDER TABLE ---
    function renderPurchases() {
        const tbody = document.getElementById('purchases-table');
        const searchValue = document.getElementById('purchase-search').value.toLowerCase();

        const filtered = purchases
            .filter(p => p.supplier.toLowerCase().includes(searchValue))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = filtered.length
            ? filtered.map(p => `
                <tr>
                    <td>${formatDate(p.date)}</td>
                    <td>${p.supplier}</td>
                    <td>${p.quantity.toFixed(2)} kg</td>
                    <td>${p.price.toFixed(2)} MAD</td>
                    <td class="font-semibold text-primary-color">${formatCurrency(p.total)}</td>
                    <td class="actions-cell">
                        <button onclick="editPurchase('${p.id}')" class="text-blue-600 hover:text-blue-800">✏️</button>
                        <button onclick="confirmDeletePurchase('${p.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="6" class="text-center text-gray-500 py-4">Aucun achat trouvé.</td></tr>';
    }
    // --- FILL MODAL FOR EDIT ---
    window.editPurchase = function (id) {
        const purchase = purchases.find(p => p.id === id);
        if (!purchase) return;

        document.getElementById('purchase-id').value = purchase.id;
        document.getElementById('purchase-date').value = purchase.date;
        document.getElementById('purchase-supplier').value = purchase.supplier;
        document.getElementById('purchase-quantity').value = purchase.quantity;
        document.getElementById('purchase-price').value = purchase.price;

        openPurchaseModal(id);
    }
    // --- SAVE PURCHASE (Add/Update) ---
    window.savePurchase = function (event) {
        event.preventDefault();

        const id = document.getElementById('purchase-id').value;
        const quantity = parseFloat(document.getElementById('purchase-quantity').value);
        const price = parseFloat(document.getElementById('purchase-price').value);

        const data = {
            id: id || Date.now().toString(), // ✅ ضمان ID صحيح دائما
            date: document.getElementById('purchase-date').value,
            supplier: document.getElementById('purchase-supplier').value,
            quantity,
            price,
            total: quantity * price,
            timestamp: Date.now()
        };

        // Update array locally
        const index = purchases.findIndex(p => p.id === data.id);
        index !== -1 ? purchases[index] = data : purchases.push(data);

        // Render UI
        renderPurchases();

        // Close modal
        closeModal('purchase-modal');

        // Save to Firebase
        saveDocument('purchases', data, data.id, null);

        // Auto Accounting Entry (only when new)
        if (!id) {
            saveDocument('accounting', {
                date: data.date,
                category: 'Achat',
                description: `Achat de ${data.quantity} kg de fruits chez ${data.supplier}`,
                amount: data.total,
                timestamp: Date.now()
            }, null, null);
        }
    }
    // --- DELETE WITH CONFIRM ---
    window.confirmDeletePurchase = async function(id) {
        const purchase = purchases.find(p => p.id === id);
        if (!purchase) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Supprimer l'achat du ${formatDate(purchase.date)} chez ${purchase.supplier} ?`,
            "confirm"
        );

        if (confirmed) {
            purchases = purchases.filter(p => p.id !== id);
            renderPurchases();
            deleteDocument('purchases', id, `Achat du ${formatDate(purchase.date)}`);
        }
    }
    // --- INITIAL LOAD ---
renderPurchases();
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Production
    // --- EXEMPLES PAR DÉFAUT --- début
    if (production.length === 0) {
        production = [
            { id: Date.now().toString() + "1", date: "2025-01-15", fruitsUsed: 100, oilProduced: 18, responsible: "Fatima" },
            { id: Date.now().toString() + "2", date: "2025-02-20", fruitsUsed: 80, oilProduced: 15, responsible: "Mohamed" },
            { id: Date.now().toString() + "3", date: "2025-03-25", fruitsUsed: 120, oilProduced: 22, responsible: "Amina" },
            { id: Date.now().toString() + "4", date: "2025-04-10", fruitsUsed: 90, oilProduced: 17, responsible: "Khadija" },
            { id: Date.now().toString() + "5", date: "2025-05-18", fruitsUsed: 110, oilProduced: 20, responsible: "Zahra" },
            { id: Date.now().toString() + "6", date: "2025-06-22", fruitsUsed: 95, oilProduced: 16, responsible: "Youssef" }
        ];
        localStorage.setItem("production", JSON.stringify(production));
    }
    function saveLocalProduction() {localStorage.setItem("production", JSON.stringify(production));}
    // --- EXEMPLES PAR DÉFAUT --- fin

    // --- OPEN MODAL (ADD / EDIT) ---
    window.openProductionModal = function (id = null) {
        document.getElementById('production-form').reset();
        document.getElementById('production-id').value = id || '';
        openModal('production-modal');
    }
    // --- RENDER TABLE ---
    function renderProduction() {
        const tbody = document.getElementById('production-table');

        const sorted = production.sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = sorted.length
            ? sorted.map(p => {
                const rendement = (p.oilProduced / p.fruitsUsed) * 100;
                const rendementClass = rendement >= 20 ? 'text-secondary-color font-bold' : 'text-orange-500';

                return `
                    <tr>
                        <td>${formatDate(p.date)}</td>
                        <td>${p.fruitsUsed.toFixed(2)} kg</td>
                        <td class="font-semibold">${p.oilProduced.toFixed(2)} L</td>
                        <td class="${rendementClass}">${rendement.toFixed(2)} %</td>
                        <td>${p.responsible}</td>
                        <td class="actions-cell">
                            <button onclick="editProduction('${p.id}')" class="text-primary-color hover:text-amber-700">✏️</button>
                            <button onclick="confirmDeleteProduction('${p.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="6" class="text-center text-gray-500 py-4">Aucune production enregistrée.</td></tr>';
    }
    // --- LOAD DATA FOR EDIT ---
    window.editProduction = function (id) {
        const prod = production.find(p => p.id === id);
        if (!prod) return;

        document.getElementById('production-id').value = prod.id;
        document.getElementById('production-date').value = prod.date;
        document.getElementById('production-fruits').value = prod.fruitsUsed;
        document.getElementById('production-oil').value = prod.oilProduced;
        document.getElementById('production-responsible').value = prod.responsible;

        openProductionModal(id);
    }
    // --- SAVE (Add/Modify) ---
    window.saveProduction = async function (event) {
        event.preventDefault();

        const id = document.getElementById('production-id').value;
        const fruitsUsed = parseFloat(document.getElementById('production-fruits').value);
        const oilProduced = parseFloat(document.getElementById('production-oil').value);
        const currentFruitStock = parseFloat(document.getElementById('fruit-stock-info').textContent);

        // Check stock if new production
        if (!id && fruitsUsed > currentFruitStock) {
            const proceed = await window.showMessageBox(
                "Attention Stock!",
                `Vous utilisez ${fruitsUsed} kg, mais il ne reste que ${currentFruitStock.toFixed(2)} kg. Continuer ?`,
                "confirm"
            );
            if (!proceed) return;
        }

        const data = {
            id: id || Date.now().toString(), // ✅ ID دائم
            date: document.getElementById('production-date').value,
            fruitsUsed,
            oilProduced,
            responsible: document.getElementById('production-responsible').value,
            timestamp: Date.now()
        };

        // Update data locally
        const index = production.findIndex(p => p.id === data.id);
        index !== -1 ? production[index] = data : production.push(data);

        renderProduction();
        closeModal('production-modal');

        // Save to Firebase
        await saveDocument('production', data, data.id, null);

        // --- Stock Update (Oil Stock) ---
        const oilStockItem = stock.find(s => s.item === "Huile d'Argan (Alimentaire)");
        const oilStockData = {
            item: "Huile d'Argan (Alimentaire)",
            unit: "L",
            minimum: oilStockItem ? oilStockItem.minimum : 10.0,
            available: oilStockItem ? oilStockItem.available + oilProduced : oilProduced
        };

        await saveDocument('stock', oilStockData, oilStockItem ? oilStockItem.id : null, null);
    }
    // --- DELETE WITH CONFIRMATION ---
    window.confirmDeleteProduction = async function(id) {
        const prod = production.find(p => p.id === id);
        if (!prod) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Supprimer la production du ${formatDate(prod.date)} ?`,
            "confirm"
        );

        if (confirmed) {
            production = production.filter(p => p.id !== id);
            renderProduction();
            deleteDocument('production', id, `Production du ${formatDate(prod.date)}`);
        }
    }
    // --- INITIAL LOAD ---
    renderProduction();
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Ventes
    // --- EXEMPLES PAR DÉFAUT --- début
    if (sales.length === 0) {
        sales = [
            { id: Date.now().toString()+"1", invoiceNumber: "F001", date: "2025-01-10", client: "Client A", product: "Huile d'Argan (Alimentaire)", quantity: 5, unitPrice: 250, total: 1250 },
            { id: Date.now().toString()+"2", invoiceNumber: "F002", date: "2025-02-15", client: "Client B", product: "Savon Argan", quantity: 10, unitPrice: 50, total: 500 },
            { id: Date.now().toString()+"3", invoiceNumber: "F003", date: "2025-03-20", client: "Client C", product: "Huile d'Argan (Cosmétique)", quantity: 3, unitPrice: 300, total: 900 },,
            { id: Date.now().toString()+"4", invoiceNumber: "F004", date: "2025-04-05", client: "Client D", product: "Huile d'Argan (Alimentaire)", quantity: 7, unitPrice: 240, total: 1680 },,
            { id: Date.now().toString()+"5", invoiceNumber: "F005", date: "2025-05-12", client: "Client E", product: "Savon Argan", quantity: 15, unitPrice: 45, total: 675 },
        ];
        localStorage.setItem("sales", JSON.stringify(sales));
    }
    function saveLocalSales() {localStorage.setItem("sales", JSON.stringify(sales));}
    // --- EXEMPLES PAR DÉFAUT --- fin

    // --- OPEN MODAL (ADD / EDIT) ---
    window.openSaleModal = function (id = null) {
        document.getElementById('sale-form').reset();
        document.getElementById('sale-id').value = id || '';
        openModal('sale-modal');
    }
    // --- RENDER TABLE ---
    function renderSales() {
        const tbody = document.getElementById('sales-table');
        const searchValue = document.getElementById('sale-search').value.toLowerCase();

        const filtered = sales
            .filter(s => s.client.toLowerCase().includes(searchValue) || s.invoiceNumber.toLowerCase().includes(searchValue))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = filtered.length
            ? filtered.map(s => `
                <tr>
                    <td class="font-mono text-xs">${s.invoiceNumber}</td>
                    <td>${formatDate(s.date)}</td>
                    <td>${s.client}</td>
                    <td>${s.product}</td>
                    <td>${s.quantity.toFixed(2)} ${s.product.includes('Huile') ? 'L' : 'unité'}</td>
                    <td>${s.unitPrice.toFixed(2)} MAD</td>
                    <td class="font-semibold text-secondary-color">${formatCurrency(s.total)}</td>
                    <td class="actions-cell">
                        <button onclick="editSale('${s.id}')" class="text-primary-color hover:text-amber-700">✏️</button>
                        <button onclick="confirmDeleteSale('${s.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="8" class="text-center text-gray-500 py-4">Aucune vente trouvée.</td></tr>';
    }
    // --- LOAD DATA FOR EDIT ---
    window.editSale = function (id) {
        const sale = sales.find(s => s.id === id);
        if (!sale) return;

        document.getElementById('sale-id').value = sale.id;
        document.getElementById('sale-invoice').value = sale.invoiceNumber;
        document.getElementById('sale-date').value = sale.date;
        document.getElementById('sale-client').value = sale.client;
        document.getElementById('sale-product').value = sale.product;
        document.getElementById('sale-quantity').value = sale.quantity;
        document.getElementById('sale-unit-price').value = sale.unitPrice;

        openSaleModal(id);
    }
    // --- SAVE SALE ---
    window.saveSale = async function (event) {
        event.preventDefault();

        const id = document.getElementById('sale-id').value;
        const quantity = parseFloat(document.getElementById('sale-quantity').value);
        const unitPrice = parseFloat(document.getElementById('sale-unit-price').value);
        const product = document.getElementById('sale-product').value;
        const total = quantity * unitPrice;

        // Stock check only for NEW sale
        if (!id && product.includes('Huile')) {
            const oilStockItem = stock.find(s => s.item === "Huile d'Argan (Alimentaire)");
            const currentOilStock = oilStockItem ? oilStockItem.available : 0;

            if (quantity > currentOilStock) {
                const proceed = await window.showMessageBox("Attention Stock!", `Stock huile = ${currentOilStock.toFixed(2)} L. Continuer ?`, "confirm");
                if (!proceed) return;
            }
        }

        const data = {
            id: id || Date.now().toString(), // ✅ ID ثابت
            invoiceNumber: document.getElementById('sale-invoice').value,
            date: document.getElementById('sale-date').value,
            client: document.getElementById('sale-client').value,
            product,
            quantity,
            unitPrice,
            total,
            timestamp: Date.now()
        };

        // Update local array
        const index = sales.findIndex(s => s.id === data.id);
        index !== -1 ? sales[index] = data : sales.push(data);

        renderSales();
        closeModal('sale-modal');

        // Save to Firebase
        await saveDocument('sales', data, data.id, null);

        // Stock update (only new sale)
        if (!id && product.includes('Huile')) {
            const oil = stock.find(s => s.item === "Huile d'Argan (Alimentaire)");
            if (oil) {
                const updatedOil = { ...oil, available: Math.max(0, oil.available - quantity) };
                await saveDocument('stock', updatedOil, oil.id, null);
            }
        }

        // Auto Accounting
        if (!id) {
            await saveDocument('accounting', {
                date: data.date,
                category: 'Vente',
                description: `Vente N°${data.invoiceNumber} à ${data.client}`,
                amount: total,
            }, null, null);
        }
    }
    // --- DELETE WITH CONFIRM ---
    window.confirmDeleteSale = async function(id) {
        const sale = sales.find(s => s.id === id);
        if (!sale) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Supprimer la vente Facture N°${sale.invoiceNumber}?`,
            "confirm"
        );

        if (confirmed) {
            sales = sales.filter(s => s.id !== id);
            renderSales();
            deleteDocument('sales', id, `Vente Facture ${sale.invoiceNumber}`);
        }
    }
    // --- INITIAL LOAD ---
    renderSales();
// +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ Stock
    // --- EXEMPLES PAR DÉFAUT --- début
    if (stock.length === 0) {
        stock = [
            { id: Date.now().toString()+"1", item: "Huile d'Argan (Alimentaire)", available: 50, unit: "L", minimum: 10 },
            { id: Date.now().toString()+"2", item: "Savon Argan", available: 200, unit: "unité", minimum: 50 },
            { id: Date.now().toString()+"3", item: "Fruits d'Argan", available: 300, unit: "kg", minimum: 100 },
            { id: Date.now().toString()+"4", item: "Emballages", available: 500, unit: "unité", minimum: 150 },
            { id: Date.now().toString()+"5", item: "Étiquettes", available: 1000, unit: "unité", minimum: 200 },
            { id: Date.now().toString()+"6", item: "Huiles Essentielles", available: 20, unit: "L", minimum: 5 }
        ];
        localStorage.setItem("stock", JSON.stringify(stock));
    }
    function saveLocalStock() {localStorage.setItem("stock", JSON.stringify(stock));}
    // --- EXEMPLES PAR DÉFAUT --- fin

    // --- OPEN MODAL (ADD / EDIT) ---
    window.openStockModal = function (id = null) {
        document.getElementById('stock-form').reset();
        document.getElementById('stock-id').value = id || '';
        document.getElementById('stock-modal-title').textContent = id ? 'Modifier l\'article' : 'Ajouter un article';
        openModal('stock-modal');
    }
    // --- RENDER TABLE ---
    function renderStock() {
        const tbody = document.getElementById('stock-table');

        tbody.innerHTML = stock.length
            ? stock.map(s => {
                const status = s.available < s.minimum ? 'Basse' : 'Suffisante';
                const statusClass = s.available < s.minimum ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';

                return `
                    <tr>
                        <td class="font-medium">${s.item}</td>
                        <td class="font-semibold">${s.available.toFixed(2)}</td>
                        <td>${s.unit}</td>
                        <td>${s.minimum.toFixed(2)} ${s.unit}</td>
                        <td>
                            <span class="px-2 py-1 text-xs font-semibold rounded-full ${statusClass}">
                                ${status}
                            </span>
                        </td>
                        <td class="actions-cell">
                            <button onclick="editStock('${s.id}')" class="text-primary-color hover:text-amber-700">✏️</button>
                            <button onclick="confirmDeleteStock('${s.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('')
            : '<tr><td colspan="6" class="text-center text-gray-500 py-4">Aucun article en stock.</td></tr>';

        updateDashboard(); // Mise à jour des infos de stock dans les modals
    }
    // --- LOAD DATA FOR EDIT ---
    window.editStock = function (id) {
        const item = stock.find(s => s.id === id);
        if (!item) return;

        document.getElementById('stock-id').value = item.id;
        document.getElementById('stock-item').value = item.item;
        document.getElementById('stock-available').value = item.available;
        document.getElementById('stock-unit').value = item.unit;
        document.getElementById('stock-minimum').value = item.minimum;

        openStockModal(id);
    }
    // --- SAVE (Add/Update) ---
    window.saveStock = function (event) {
        event.preventDefault();

        const id = document.getElementById('stock-id').value;

        const data = {
            id: id || Date.now().toString(), // ✅ ID ثابت دائمًا
            item: document.getElementById('stock-item').value,
            available: parseFloat(document.getElementById('stock-available').value),
            unit: document.getElementById('stock-unit').value,
            minimum: parseFloat(document.getElementById('stock-minimum').value),
            timestamp: Date.now()
        };

        // Update locally
        const index = stock.findIndex(s => s.id === data.id);
        index !== -1 ? stock[index] = data : stock.push(data);

        renderStock();
        closeModal('stock-modal');

        // Save to Firebase
        saveDocument('stock', data, data.id, null);
    }
    // --- DELETE WITH CONFIRMATION ---
    window.confirmDeleteStock = async function(id) {
        const item = stock.find(s => s.id === id);
        if (!item) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Supprimer "${item.item}" du stock ?`,
            "confirm"
        );

        if (confirmed) {
            stock = stock.filter(s => s.id !== id);
            renderStock();
            deleteDocument('stock', id, item.item);
        }
    }
    // --- INITIAL LOAD ---
    renderStock();
// +++++++++++++++++++++++++++ Comptabilité
    // --- EXEMPLES PAR DÉFAUT --- début
    if (accounting.length === 0) {
        accounting = [
            { id: Date.now().toString() + "1", date: "2025-01-01", category: "Vente", description: "Vente N°001", amount: 1500, timestamp: Date.now() },
            { id: Date.now().toString() + "2", date: "2025-01-02", category: "Achat", description: "Achat de fruits", amount: 700, timestamp: Date.now() },
            { id: Date.now().toString() + "3", date: "2025-01-03", category: "Revenu Divers", description: "Subvention gouvernementale", amount: 3000, timestamp: Date.now() },
            { id: Date.now().toString() + "4", date: "2025-01-04", category: "Dépense Divers", description: "Frais de transport", amount: 400, timestamp: Date.now() }
        ];
        localStorage.setItem("accounting", JSON.stringify(accounting));
    }
    function saveLocalAccounting() {localStorage.setItem("accounting", JSON.stringify(accounting));}
    // --- EXEMPLES PAR DÉFAUT --- fin
    
    // --- RENDERING DES PAGES ---
    window.openAccountingModal = function (id = null) {
        document.getElementById('accounting-form').reset();
        document.getElementById('accounting-id').value = id || '';
        openModal('accounting-modal');
    }
        // --- OPEN MODAL (ADD / EDIT) ---
    window.openAccountingModal = function (id = null) {
        document.getElementById('accounting-form').reset();
        document.getElementById('accounting-id').value = id || '';
        openModal('accounting-modal');
    }
    // --- RENDER TABLE ---
    function renderAccounting() {
        const tbody = document.getElementById('accounting-table');
        const searchValue = document.getElementById('accounting-search').value.toLowerCase();
        const filterValue = document.getElementById('accounting-filter').value;

        const filtered = accounting
            .filter(a =>
                a.description.toLowerCase().includes(searchValue) ||
                a.category.toLowerCase().includes(searchValue)
            )
            .filter(a =>
                !filterValue || a.category.startsWith(filterValue.split(' ')[0])
            )
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = filtered.length
            ? filtered.map(a => {
                const type = (a.category === 'Vente' || a.category.includes('Revenu')) ? 'Revenu' : 'Dépense';
                const typeClass = type === 'Revenu' ? 'text-secondary-color' : 'text-red-600';
                const sign = type === 'Dépense' ? '-' : '';

                return `
                <tr>
                    <td>${formatDate(a.date)}</td>
                    <td>${a.category}</td>
                    <td class="truncate max-w-xs">${a.description}</td>
                    <td class="${typeClass} font-semibold">${sign} ${formatCurrency(a.amount)}</td>
                    <td>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${type === 'Revenu' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${type}
                        </span>
                    </td>
                    <td class="actions-cell">
                        <button onclick="editAccounting('${a.id}')" class="text-primary-color hover:text-amber-700">✏️</button>
                        <button onclick="confirmDeleteAccounting('${a.id}')" class="text-red-600 hover:text-red-800">🗑️</button>
                    </td>
                </tr>
            `;
            }).join('')
            : '<tr><td colspan="6" class="text-center text-gray-500 py-4">Aucune opération trouvée.</td></tr>';

        updateAccountingStats();
    }
    // --- STATS ---
    function updateAccountingStats() {
        const revenues = accounting
            .filter(a => a.category === 'Vente' || a.category.includes('Revenu'))
            .reduce((sum, a) => sum + a.amount, 0);

        const expenses = accounting
            .filter(a => a.category === 'Achat' || a.category.includes('Dépense'))
            .reduce((sum, a) => sum + a.amount, 0);

        const balance = revenues - expenses;

        document.getElementById('total-revenue').textContent = formatCurrency(revenues);
        document.getElementById('total-expenses').textContent = formatCurrency(expenses);
        document.getElementById('current-balance').textContent = formatCurrency(balance);
        document.getElementById('current-balance').style.color = balance >= 0 ? 'var(--secondary-color)' : '#dc2626';
    }
    // --- SAVE (Ajout / Modification) ---
    window.saveAccounting = function (event) {
        event.preventDefault();

        const id = document.getElementById('accounting-id').value;
        const data = {
            id: id || Date.now().toString(), // ✅ توحيد الـ ID دائما
            date: document.getElementById('accounting-date').value,
            category: document.getElementById('accounting-category').value,
            description: document.getElementById('accounting-description').value,
            amount: parseFloat(document.getElementById('accounting-amount').value),
            timestamp: Date.now()
        };

        // Update locally
        const index = accounting.findIndex(a => a.id === data.id);
        index !== -1 ? accounting[index] = data : accounting.push(data);

        renderAccounting();
        closeModal('accounting-modal');

        // Save Firebase
        saveDocument('accounting', data, data.id, null);
        saveLocalAccounting();
    };
    // --- EDIT ---
    window.editAccounting = function (id) {
        const op = accounting.find(a => a.id === id);
        if (!op) return;

        document.getElementById('accounting-id').value = id;
        document.getElementById('accounting-date').value = op.date;
        document.getElementById('accounting-category').value = op.category;
        document.getElementById('accounting-description').value = op.description;
        document.getElementById('accounting-amount').value = op.amount;

        openAccountingModal(id);
    };
    // --- DELETE WITH CONFIRMATION ---
    window.confirmDeleteAccounting = async function (id) {
        const op = accounting.find(a => a.id === id);
        if (!op) return;

        const confirmed = await window.showMessageBox(
            "Confirmation de suppression",
            `Supprimer l'opération du ${formatDate(op.date)} ?`,
            "confirm"
        );

        if (confirmed) {
            accounting = accounting.filter(a => a.id !== id);
            renderAccounting();
            deleteDocument('accounting', id, `Opération du ${formatDate(op.date)}`);
        }
        saveLocalAccounting();
    };
    // --- INITIAL LOAD ---
    renderAccounting();
    
// +++++++++++++++++++++++++++
// ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

    // --- CRUD : SAVE (Ajout/Modification) ---
    async function saveDocument(collectionName, data, id, modalId) {
        try {
            if (id) {
                await setDoc(doc(db, getCollectionPath(collectionName), id), data);
                console.log(`Document mis à jour dans ${collectionName}: ${id}`);
            } else {
                await addDoc(collection(db, getCollectionPath(collectionName)), data);
                console.log(`Document ajouté à ${collectionName}`);
            }
            window.closeModal(modalId);
        } catch (e) {
            console.error("Erreur lors de la sauvegarde du document: ", e);
            window.showMessageBox("Erreur", "Impossible de sauvegarder les données. Consultez la console.", "alert");
        }
    }
    // --- CRUD : DELETE ---
    window.deleteDocument = async function (collectionName, id, name) {
        const confirm = await window.showMessageBox(
            "Confirmation de suppression",
            `Êtes-vous sûr de vouloir supprimer: ${name}? Cette action est irréversible.`,
            "confirm",
            "Oui, Supprimer",
            "Annuler"
        );
        if (confirm) {
            try {
                await deleteDoc(doc(db, getCollectionPath(collectionName), id));
                console.log(`Document ${id} supprimé de ${collectionName}`);
                window.showMessageBox("Succès", "L'élément a été supprimé.", "alert");
            } catch (e) {
                console.error("Erreur lors de la suppression du document: ", e);
                window.showMessageBox("Erreur", "Impossible de supprimer le document. Consultez la console.", "alert");
            }
        }
    }
    // --- GESTION DES PARAMÈTRES (Settings) ---
    window.saveGlobalSettings = async function () {
        const data = {
            name: document.getElementById('association-name').value,
            phone: document.getElementById('association-phone').value,
            address: document.getElementById('association-address').value,
        };
        try {
            // Stocker les paramètres globaux (accessibles par tous)
            const globalSettingsDoc = doc(db, `artifacts/${appId}/public/data/settings/global`);
            await setDoc(globalSettingsDoc, data, { merge: true });
            window.showMessageBox("Succès", "Les informations de l'association ont été enregistrées.", "alert");
        } catch (e) {
            console.error("Erreur lors de la sauvegarde des paramètres globaux:", e);
            window.showMessageBox("Erreur", "Impossible d'enregistrer les paramètres globaux.", "alert");
        }
    }
    window.saveSettings = async function () {
        // Logique pour sauvegarder les paramètres de l'utilisateur (Langue/Devise - si vous voulez les persister)
        window.showMessageBox("Paramètres Enregistrés", "Les paramètres de l'utilisateur ont été enregistrés localement.", "alert");
    }
    // --- GESTION DES GRAPHIQUES CHART.JS ---
    // Fonction pour regrouper les données par mois
    function groupDataByMonth(dataArray, dateField, valueField, isExpense = false) {
        const monthlyData = {};
        dataArray.forEach(item => {
            const date = item[dateField];
            if (!date) return;
            const monthYear = date.substring(0, 7); // YYYY-MM
            const value = item[valueField];
            if (!monthlyData[monthYear]) {
                monthlyData[monthYear] = 0;
            }
            // Si c'est une dépense, on la rend négative pour l'affichage (pas pour le total des achats)
            monthlyData[monthYear] += value * (isExpense ? -1 : 1);
        });
        return monthlyData;
    }
    function drawMonthlyChart() {
        const salesData = groupDataByMonth(sales, 'date', 'total');
        const purchaseData = groupDataByMonth(purchases, 'date', 'total');
        // Fusionner les clés
        const allMonths = [...new Set([...Object.keys(salesData), ...Object.keys(purchaseData)])].sort();
        const salesValues = allMonths.map(month => salesData[month] || 0);
        const purchaseValues = allMonths.map(month => purchaseData[month] || 0);
        const labels = allMonths.map(month => {
            const [year, monthNum] = month.split('-');
            return `${monthNum}/${year}`;
        });
        const ctx = document.getElementById('monthlyChart').getContext('2d');
        if (monthlyChartInstance) monthlyChartInstance.destroy();
        monthlyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenus des Ventes (MAD)',
                    data: salesValues,
                    backgroundColor: 'var(--secondary-color)',
                    borderRadius: 5,
                }, {
                    label: 'Coût des Achats (MAD)',
                    data: purchaseValues.map(v => -v), // Afficher les achats en négatif
                    backgroundColor: 'var(--primary-color)',
                    borderRadius: 5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Montant (MAD)' },
                        ticks: { callback: (value) => value.toLocaleString('fr-FR') }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(Math.abs(context.parsed.y))}` } }
                }
            }
        });
    }
    function drawPurchasesChart() {
        const purchaseData = groupDataByMonth(purchases, 'date', 'total');
        const allMonths = Object.keys(purchaseData).sort();
        const purchaseValues = allMonths.map(month => purchaseData[month] || 0);
        const labels = allMonths.map(month => {
            const [year, monthNum] = month.split('-');
            return `${monthNum}/${year}`;
        });
        const ctx = document.getElementById('purchasesChart').getContext('2d');
        if (purchasesChartInstance) purchasesChartInstance.destroy();
        purchasesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Dépense totale des Achats (MAD)',
                    data: purchaseValues,
                    borderColor: 'var(--primary-color)',
                    backgroundColor: 'rgba(217, 119, 6, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Montant (MAD)' },
                        ticks: { callback: (value) => value.toLocaleString('fr-FR') }
                    }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` } }
                }
            }
        });
    }
    function drawProductionChart() {
        // Récupérer les 10 dernières productions
        const latestProduction = production.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).reverse();
        const rendements = latestProduction.map(p => (p.oilProduced / p.fruitsUsed) * 100);
        const labels = latestProduction.map(p => formatDate(p.date));
        const ctx = document.getElementById('productionChart').getContext('2d');
        if (productionChartInstance) productionChartInstance.destroy();
        productionChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Rendement (%)',
                    data: rendements,
                    borderColor: 'var(--secondary-color)',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Rendement (%)' },
                        max: 30, // Max réaliste pour l'huile d'argan
                        ticks: { callback: (value) => `${value} %` }
                    },
                    x: { title: { display: true, text: 'Date de Production' } }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} %` } }
                }
            }
        });
    }
    function drawAccountingChart() {
        // Grouper les opérations par année
        const annualRevenues = {};
        const annualExpenses = {};
        accounting.forEach(op => {
            const year = op.date ? op.date.substring(0, 4) : '2025'; // Default year if date missing
            const isRevenue = op.category.includes('Revenu') || op.category === 'Vente';
            const amount = op.amount;
            if (isRevenue) {
                annualRevenues[year] = (annualRevenues[year] || 0) + amount;
            } else {
                annualExpenses[year] = (annualExpenses[year] || 0) + amount;
            }
        });
        const allYears = [...new Set([...Object.keys(annualRevenues), ...Object.keys(annualExpenses)])].sort();
        const revenueValues = allYears.map(year => annualRevenues[year] || 0);
        const expenseValues = allYears.map(year => annualExpenses[year] || 0);
        const ctx = document.getElementById('accountingChart').getContext('2d');
        if (accountingChartInstance) accountingChartInstance.destroy();
        accountingChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: allYears,
                datasets: [{
                    label: 'Revenus Annuels (MAD)',
                    data: revenueValues,
                    backgroundColor: 'var(--secondary-color)',
                    borderRadius: 5,
                }, {
                    label: 'Dépenses Annuelles (MAD)',
                    data: expenseValues,
                    backgroundColor: 'var(--primary-color)',
                    borderRadius: 5,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Montant (MAD)' },
                        ticks: { callback: (value) => value.toLocaleString('fr-FR') }
                    },
                    x: { title: { display: true, text: 'Année' } }
                },
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}` } }
                }
            }
        });
    }
    // --- EXPORT ---
    window.exportSales = function() {
        const data = sales;
        if (data.length === 0) {
            window.showMessageBox("Exportation", "Aucune donnée de vente à exporter.", "alert");
            return;
        }
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // En-têtes CSV
        const headers = ["N° Facture", "Date", "Client", "Produit", "Quantité", "Prix unitaire (MAD)", "Total (MAD)"];
        csvContent += headers.join(";") + "\n";
        // Lignes de données
        data.forEach(item => {
            const row = [
                item.invoiceNumber,
                formatDate(item.date),
                item.client,
                item.product,
                item.quantity.toFixed(2),
                item.unitPrice.toFixed(2),
                item.total.toFixed(2)
            ];
            csvContent += row.join(";") + "\n";
        });
        // Créer un lien de téléchargement
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "ventes_argan_tifaout.csv");
        document.body.appendChild(link); // Requis pour Firefox
        link.click();
        document.body.removeChild(link);
        
        window.showMessageBox("Succès", "L'exportation des ventes a démarré.", "alert");
    }






    
    