
// Verification Script for 23 Items with Hardcoded URLs (DB Bypass)

const candidates = [
    { id: 'advance_r_125', name: 'ADVANCE R 125', url: 'https://www.auteco.com.co/moto-victory-advance-r-125/p' },
    { id: 'agility_fusion_trakku', name: 'AGILITY FUSION TRAKKU', url: 'https://www.auteco.com.co/moto-kymco-agility-fusion-trakku/p?skuId=21130162' },
    { id: 'apache_160_carburada_abs', name: 'APACHE 160 CARBURADA ABS', url: 'https://www.auteco.com.co/apache-rtr-160-4v-xconnect-abs/p?skuId=21135507' },
    { id: 'bet_abs', name: 'BET ABS', url: 'https://www.auteco.com.co/moto-victory-bet-abs/p' },
    { id: 'cool_joy', name: 'COOL JOY', url: 'https://www.auteco.com.co/moto-electrica-starker-cooljoy/p' },
    { id: 'ecomad', name: 'ECOMAD', url: 'https://www.auteco.com.co/patineta-electrica-velocifero-ecomad/p' },
    { id: 'iqube', name: 'IQUBE', url: 'https://www.auteco.com.co/moto-electrica-tvs-iqube/p?skuId=21133890' },
    { id: 'ninja_500', name: 'NINJA 500', url: 'https://www.auteco.com.co/kawasaki-ninja-500/p?skuId=21135427' },
    { id: 'nitro_125_trakku', name: 'NITRO 125 TRAKKU', url: 'https://www.auteco.com.co/moto-victory-nitro-125-trakku/p' },
    { id: 'ntorq_125_xconnect_fi', name: 'NTORQ 125 XCONNECT FI', url: 'https://www.auteco.com.co/moto-tvs-ntorq-125-xconnect-fi/p?skuId=21135498' },
    { id: 'raider_125', name: 'RAIDER 125', url: 'https://www.auteco.com.co/moto-tvs-raider-125/p?skuId=21135480' },
    { id: 'raider_125_fi', name: 'RAIDER 125 FI', url: 'https://www.auteco.com.co/moto-tvs-raider-125-fi/p?skuId=21135502' },
    { id: 'ronin_225_td', name: 'RONIN 225 TD', url: 'https://www.auteco.com.co/moto-tvs-ronin-225-td/p?skuId=21108520' },
    { id: 'star_kids', name: 'STAR KIDS', url: 'https://www.auteco.com.co/moto-electrica-starker-star-kids/p?skuId=21116561' },
    { id: 'star_kids_pro', name: 'STAR KIDS PRO', url: 'https://www.auteco.com.co/moto-electrica-starker-star-kids-pro/p?skuId=21011740' },
    { id: 'switch_125', name: 'SWITCH 125', url: 'https://www.auteco.com.co/moto-victory-switch-125/p' },
    { id: 'switch_125_tk', name: 'SWITCH 125 TK', url: 'https://www.auteco.com.co/moto-victory-switch-125-tk/p' },
    { id: 'tnt_25n', name: 'TNT 25N', url: 'https://www.auteco.com.co/moto-benelli-tnt-25n/p' },
    { id: 'tricargo_300', name: 'TRICARGO 300', url: 'https://www.auteco.com.co/motocarro-ceronte-tricargo-300/p' },
    { id: 'trk_251', name: 'TRK 251', url: 'https://www.auteco.com.co/moto-benelli-trk-251/p' },
    { id: 'versys_300_abs', name: 'VERSYS 300 ABS', url: 'https://www.auteco.com.co/moto-kawasaki-versys-300-abs/p?skuId=21130346' },
    { id: 'volta_350', name: 'VOLTA 350', url: 'https://www.auteco.com.co/patineta-electrica-starker-volta-350/p' },
    { id: 'z500', name: 'Z500', url: 'https://www.auteco.com.co/kawasaki-z500/p?skuId=21135415' }
];

async function main() {
    console.log(`\n### Reporte de Verificación de Scraper (23 Items)\n`);
    console.log(`| Referencia (ID) | Desplazamiento Actual | Nuevo Desplazamiento (Scraper) | Nueva Garantía | Estado |`);
    console.log(`|---|---|---|---|---|`);

    for (const cand of candidates) {
        if (cand.url) {
            // Short delay
            await new Promise(r => setTimeout(r, 100));

            const result: any = await fetchWithVtexStrategy(cand.url);
            const status = (result.displacement && result.displacement !== 'ERROR_FETCH') ? '✅ RECUPERADO' : '⚠️ S/D';

            const dispDisplay = result.displacement ? `**${result.displacement}**` : 'Pending';
            const warrDisplay = result.warranty ? result.warranty : 'Pending';

            // Clean Name
            const cleanName = cand.name ? cand.name.replace('|', '') : cand.id;

            console.log(`| ${cleanName.padEnd(20)} | 0 (Undefined) | ${dispDisplay.padEnd(15)} | ${warrDisplay.padEnd(15)} | ${status} |`);
        }
    }
}

async function fetchWithVtexStrategy(url: string) {
    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
            }
        });

        if (!response.ok) return { displacement: null, warranty: null };
        const data = await response.text();

        // --- VTEX STATE STRATEGY ---
        const startMarker = '<template data-type="json" data-varname="__STATE__">';
        const endMarker = '</template>';
        const startIndex = data.indexOf(startMarker);

        let extracted = { displacement: null as string | null, warranty: null as string | null };

        if (startIndex !== -1) {
            const contentStart = startIndex + startMarker.length;
            const endIndex = data.indexOf(endMarker, contentStart);
            if (endIndex !== -1) {
                let stateContent = data.substring(contentStart, endIndex);

                const scriptStart = stateContent.indexOf('<script>');
                if (scriptStart !== -1) {
                    const scriptEnd = stateContent.indexOf('</script>');
                    if (scriptEnd !== -1) {
                        stateContent = stateContent.substring(scriptStart + 8, scriptEnd);
                    }
                }

                try {
                    const state = JSON.parse(stateContent);
                    const productKey = Object.keys(state).find(k => k.startsWith('Product:') && state[k].productName);

                    if (productKey) {
                        const product = state[productKey];
                        const normalize = (val: string) => val ? val.trim() : null;

                        if (product.properties && Array.isArray(product.properties)) {
                            product.properties.forEach((ref: any) => {
                                const propObj = state[ref.id];
                                if (propObj && propObj.name && propObj.values && propObj.values.json) {
                                    const name = propObj.name.toLowerCase();
                                    const val = propObj.values.json[0];
                                    if (name.includes('cilindraje') || name.includes('cilindrada')) extracted.displacement = normalize(val);
                                    if (name.includes('garantía') || name.includes('garantia')) extracted.warranty = normalize(val);
                                }
                            });
                        }

                        if (!extracted.displacement || !extracted.warranty) {
                            if (product.specificationGroups && Array.isArray(product.specificationGroups)) {
                                product.specificationGroups.forEach((groupRef: any) => {
                                    const groupObj = state[groupRef.id];
                                    if (groupObj && groupObj.specifications && Array.isArray(groupObj.specifications)) {
                                        groupObj.specifications.forEach((specRef: any) => {
                                            const specObj = state[specRef.id];
                                            if (specObj && specObj.name && specObj.values && specObj.values.json) {
                                                const name = specObj.name.toLowerCase();
                                                const val = specObj.values.json[0];
                                                if ((name.includes('cilindraje') || name.includes('cilindrada')) && !extracted.displacement) extracted.displacement = normalize(val);
                                                if ((name.includes('garantía') || name.includes('garantia')) && !extracted.warranty) extracted.warranty = normalize(val);
                                            }
                                        });
                                    }
                                });
                            }
                        }
                    }
                } catch (e) { }
            }
        }
        return extracted;

    } catch (e) {
        return { displacement: null, warranty: null };
    }
}

main().catch(console.error);
