#!/usr/bin/env node

const VERSION = require('./package.json').version;
const express = require('express');
// const util = require('util');

/** @type {number} */
const PORT = process.env.PORT || 7000;
const prefix = 'pl_id:';
const defaultType = 'Playlistio';

const app = express();
app.set('trust proxy', true);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS')
        return res.sendStatus(204);
    next();
});

function parseConfig(configStr) {
    return JSON.parse(configStr);
}

// Stremio Addon Manifest Route
app.get('/:config/manifest.json', (req, res) => {
    try {
        const userConfig = parseConfig(req.params.config);
        return res.json({
            id: 'playlistio.elfhosted.com',
            version: VERSION,
            name: 'Playlistio | ElfHosted',
            description: 'Convert catalogs into an auto-playable series.',
            resources: ['catalog', 'meta'],
            types: [...new Set(userConfig.catalogs?.map(pl => {
                const id = pl.id.slice(prefix.length);
                return id.slice(id.indexOf(':') + 1).split('/', 1)[0];
            }) ?? [])],
            idPrefixes: [prefix],
            catalogs: userConfig.catalogs?.map(pl => ({
                type: defaultType,
                id: prefix + (pl.type ?? defaultType),
                name: pl.type ?? defaultType,
            })) ?? [],
            logo: `https://github.com/xXCrash2BomberXx/Playlistio/blob/${process.env.DEV_LOGGING ? 'main' : `v${VERSION}`}/icon.png?raw=true`,
            behaviorHints: {
                configurable: true
            }
        });
    } catch (error) {
        if (process.env.DEV_LOGGING) console.error('Error in Manifest handler: ' + error);
        return res.json({});
    }
});

// Stremio Addon Catalog Route
app.get('/:config/catalog/:type/:id/:extra?.json', async (req, res) => {
    try {
        if (!req.params.id?.startsWith(prefix)) throw new Error(`Unknown ID in Catalog handler: "${req.params.id}"`);
        const userConfig = parseConfig(req.params.config);
        return res.json({
            metas: userConfig.catalogs?.map(pl => {
                const type = pl.id.slice(prefix.length).split(':', 2)[1].split('/', 1)[0];
                return {
                    id: pl.id,
                    type: type,
                    name: `${pl.name} (${type})`,
                    poster: undefined
                };
            }) ?? []
        });
    } catch (error) {
        if (process.env.DEV_LOGGING) console.error('Error in Catalog handler: ' + error);
        return res.json({ metas: [] });
    }
});

// Stremio Addon Meta Route
app.get('/:config/meta/:type/:id.json', async (req, res) => {
    try {
        if (!req.params.id?.startsWith(prefix)) throw new Error(`Unknown ID in Meta handler: "${req.params.id}"`);
        const userConfig = parseConfig(req.params.config);
        const pl = userConfig.catalogs?.find(pl => pl.id === req.params.id);
        if (!pl) throw new Error(`Catalog ID not found in Meta handler: "${req.params.id}"`);
        const id = pl.id.slice(prefix.length);
        const hashEnd = id.indexOf(':');
        const url = id.slice(hashEnd + 1);
        const type = url.split('/', 1)[0];
        return res.json({
            meta: {
                id: req.params.id,
                type: req.params.type,
                name: `${pl.name} (${type})`,
                videos: (await (await fetch((userConfig.hashes?.[id.slice(0, hashEnd)] ?? '') + url)).json())?.metas.map((m, i) => ({
                    id: m.id,
                    title: m.name,
                    released: m.released ?? new Date(0).toISOString(),
                    thumbnail: m.background ?? m.poster,
                    episode: i + 1,
                    season: 1,
                    trailers: m.trailers,
                    overview: m.description,
                }))
            }
        });
    } catch (error) {
        if (process.env.DEV_LOGGING) console.error('Error in Meta handler: ' + error);
        return res.json({ meta: {} });
    }
});

// Configuration Page
app.get(['/', '/:config?/configure'], async (req, res) => {
    /** @type {Object?} */
    let userConfig;
    try {
        userConfig = req.params.config ? parseConfig(req.params.config) : {};
    } catch (error) {
        if (process.env.DEV_LOGGING) console.error('Error in Config handler: ' + error);
        userConfig = {};
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <link href="https://fonts.googleapis.com/css2?family=Ubuntu&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Ubuntu', Helvetica, Arial, sans-serif; text-align: center; padding: 2rem; background: #f4f4f8; color: #333; }
                .container { max-width: 50rem; margin: auto; background: white; padding: 2rem; border-radius: 1rem; }
                h1 { color: #d92323; }
                textarea { width: 100%; height: 15rem; padding: 1rem; border-radius: 1rem; border: 0.1rem solid #ccc; box-sizing: border-box; resize: vertical; }
                th, td { border: 0.1rem solid #ccc; padding: 1rem; text-align: left; }
                input { width: 100%; box-sizing: border-box; }
                .install-button { margin-top: 1rem; border-width: 0; display: inline-block; padding: 0.5rem; background-color: #5835b0; color: white; border-radius: 0.2rem; cursor: pointer; }
                .install-button:hover { background-color: #4a2c93; }
                .install-button:disabled { background-color: #ccc; cursor: not-allowed; }
                .error { color: #d92323; margin-top: 1rem; }
                .settings-section { text-align: left; margin-top: 2rem; padding: 1rem; border: 0.1rem solid #ddd; border-radius: 1rem; background: #f9f9f9; }
                .toggle-container { display: flex; align-items: center; margin: 1rem 0; }
                .toggle-container input[type="checkbox"] { margin-right: 1rem; }
                .toggle-container label { cursor: pointer; }
                .setting-description { color: #666; }
                @media (prefers-color-scheme: dark) {
                    body { background: #121212; color: #e0e0e0; }
                    .container { background: #1e1e1e; }
                    textarea, input, select { 
                        background: #2a2a2a; 
                        color: #e0e0e0; 
                        border: 0.1rem solid #555; 
                    }
                    th, td { border: 0.1rem solid #555; }
                    .install-button { background-color: #6a5acd; }
                    .install-button:hover { background-color: #5941a9; }
                    .install-button:disabled { background-color: #555; }
                    .settings-section { background: #1e1e1e; border: 0.1rem solid #333; }
                    .setting-description { color: #aaa; }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div style="display: flex; justify-content: center; margin: 1rem; align-items: center;">
                    <img src="https://github.com/xXCrash2BomberXx/Playlistio/blob/${process.env.DEV_LOGGING ? 'main' : `v${VERSION}`}/icon.png?raw=true" alt="Playlistio">
                    <h1 style="position: relative; top: 96px; left: -80px; font-size: 32px;">ElfHosted</h1>
                </div>
                <h3 style="color: #f5a623;">v${VERSION}</h3>
                ${process.env.EMBED ?? ""}
                <form id="config-form">
                    <div class="settings-section">
                        <h3>Catalogs</h3>
                        <hr>
                        <div style="margin-bottom: 1rem;">
                            <button type="button" id="add-manifest" class="install-button">Add Catalogs from Manifest</button>
                        </div>
                        <table id="catalog-table" style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th>Playlistio Catalog Name</th>
                                    <th>Catalog ID</th>
                                    <th>Playlist Name</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody></tbody>
                        </table>
                    </div>
                    <button type="submit" class="install-button" id="submit-btn">Generate Install Link</button>
                    <div id="error-message" class="error" style="display:none;"></div>
                </form>
                <div id="results" style="display:none;">
                    <h2>Install your addon</h2>
                    <a href="#" target="_blank" id="install-stremio" class="install-button">Stremio</a>
                    <a href="#" target="_blank" id="install-web" class="install-button">Stremio Web</a>
                    <a id="copy-btn" class="install-button">Copy URL</a>
                    <a href="#" id="reload" class="install-button">Reload</a>
                    <input type="text" id="install-url" style="display: none;" readonly class="url-input">
                </div>
            </div>
            <script>
                const submitBtn = document.getElementById('submit-btn');
                const errorDiv = document.getElementById('error-message');
                const resultsDiv = document.getElementById('results');
                function configChanged() {
                    resultsDiv.style.display = 'none';
                }
                const installStremio = document.getElementById('install-stremio');
                const installWeb = document.getElementById('install-web');
                const reload = document.getElementById('reload');
                const installUrlInput = document.getElementById('install-url');
                const catalogTableBody = document.querySelector('#catalog-table tbody');
                let catalogs = ${JSON.stringify(userConfig.catalogs?.map(pl => ({
        ...pl,
        id: pl.id.startsWith(prefix) ? pl.id.slice(prefix.length) : pl.id
    })) ?? [])};
                let hashes = ${JSON.stringify(userConfig.hashes ?? {})};
                function makeActions(callback, array, index) {
                    const actionsCell = document.createElement('td');
                    const upBtn = document.createElement('button');
                    upBtn.textContent = '↑';
                    upBtn.classList.add('install-button');
                    upBtn.style.margin = '0.2rem';
                    upBtn.addEventListener('click', () => {
                        if (index > 0) {
                            [array[index - 1], array[index]] = [array[index], array[index - 1]];
                            callback();
                        }
                    });
                    const downBtn = document.createElement('button');
                    downBtn.textContent = '↓';
                    downBtn.classList.add('install-button');
                    downBtn.style.margin = '0.2rem';
                    downBtn.addEventListener('click', () => {
                        if (index < array.length - 1) {
                            [array[index + 1], array[index]] = [array[index], array[index + 1]];
                            callback();
                        }
                    });
                    const removeBtn = document.createElement('button');
                    removeBtn.textContent = 'Remove';
                    removeBtn.classList.add('install-button');
                    removeBtn.style.margin = '0.2rem';
                    removeBtn.addEventListener('click', () => {
                        array.splice(index, 1);
                        callback();
                    });
                    actionsCell.appendChild(upBtn);
                    actionsCell.appendChild(downBtn);
                    actionsCell.appendChild(removeBtn);
                    return actionsCell;
                }
                function renderCatalogs() {
                    catalogTableBody.innerHTML = '';
                    catalogs.forEach((pl, index) => {
                        const row = document.createElement('tr');
                        // Type
                        const typeCell = document.createElement('td');
                        const typeInput = document.createElement('input');
                        typeInput.value = pl.type;
                        typeInput.addEventListener('input', () => {
                            pl.type = typeInput.value.trim();
                            configChanged();
                        });
                        typeCell.appendChild(typeInput);
                        // ID
                        const idCell = document.createElement('td');
                        const idInput = document.createElement('input');
                        idInput.value = pl.id;
                        idInput.required = true;
                        idInput.addEventListener('change', () => {
                            pl.id = idInput.value;
                            configChanged();
                        });
                        idCell.appendChild(idInput);
                        // Name
                        const nameCell = document.createElement('td');
                        const nameInput = document.createElement('input');
                        nameInput.value = pl.name;
                        nameInput.required = true;
                        nameInput.addEventListener('input', () => {
                            pl.name = nameInput.value.trim();
                            configChanged();
                        });
                        nameCell.appendChild(nameInput);
                        row.appendChild(typeCell);
                        row.appendChild(idCell);
                        row.appendChild(nameCell);
                        row.appendChild(makeActions(renderCatalogs, catalogs, index));
                        catalogTableBody.appendChild(row);
                    });
                    configChanged();
                }
                async function generateHash(data) {
                    const textEncoder = new TextEncoder();
                    const dataBuffer = textEncoder.encode(data);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    return hashHex;
                }
                document.getElementById('add-manifest').addEventListener('click', async () => {
                    const url = prompt('Enter the URL of the manifest:');
                    if (url && url.endsWith('manifest.json')) {
                        const response = await fetch(url);
                        if (response.ok) {
                            const manifest = await response.json();
                            const catalogURL = \`\${url.slice(0, -'/manifest.json'.length)}/catalog/\`;
                            const hash = await generateHash(JSON.stringify(manifest));
                            hashes[hash] = catalogURL;
                            manifest.catalogs?.forEach(c => {
                                if (c.extra?.find(x => x.name === 'search')?.isRequired) return;
                                catalogs.push({ type: ${JSON.stringify(defaultType)}, id: \`\${hash}:\${c.type}/\${c.id}.json\`, name: c.name })
                            });
                            renderCatalogs();
                        } else
                            alert('Failed to fetch manifest.');
                    }
                });
                renderCatalogs();
                document.getElementById('config-form').addEventListener('submit', async function(event) {
                    event.preventDefault();
                    submitBtn.disabled = true;
                    const originalText = submitBtn.textContent;
                    submitBtn.textContent = 'Generating...';
                    errorDiv.style.display = 'none';
                    try {
                        const filteredHashes = Object.fromEntries(Object.entries(hashes).filter(([k, v]) => catalogs.some(c => c.id.startsWith(k))));
                        const modifiedCatalogs = catalogs.map(pl => ({
                            ...pl,
                            id: ${JSON.stringify(prefix)} + pl.id
                        }));
                        const configString = \`://${req.get('host')}/\${encodeURIComponent(JSON.stringify({
                            ...(Object.keys(filteredHashes).length ? { hashes: filteredHashes } : {}),
                            ...(modifiedCatalogs.length ? { catalogs: modifiedCatalogs } : {})
                        }))}/\`;
                        const protocol = ${JSON.stringify(req.protocol)};
                        const manifestString = configString + 'manifest.json';
                        installStremio.href = 'stremio' + manifestString;
                        reload.href = \`\${protocol}\${configString}configure\`;
                        installUrlInput.value = protocol + manifestString;
                        installWeb.href = \`https://web.stremio.com/#/addons?addon=\${encodeURIComponent(installUrlInput.value)}\`;
                        resultsDiv.style.display = 'block';
                    } catch (error) {
                        errorDiv.textContent = error.message;
                        errorDiv.style.display = 'block';
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.textContent = originalText;
                    }
                });
                document.getElementById('copy-btn').addEventListener('click', async function() {
                    await navigator.clipboard.writeText(installUrlInput.value);
                    this.textContent = 'Copied!';
                    setTimeout(() => { this.textContent = 'Copy URL'; }, 2000);
                });
            </script>
        </body>
        </html>
    `);
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    if (process.env.DEV_LOGGING) console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start the Server
app.listen(PORT, () => {
    console.log(`Addon server v${VERSION} running on port ${PORT}`);
    console.log(`Access the configuration page at: ${process.env.SPACE_HOST ? 'https://' + process.env.SPACE_HOST : 'http://localhost:' + PORT}`);
});
