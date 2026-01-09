
import { db, auth } from '../src/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

// DATA FROM VERIFICATION (Hardcoded for Safety)
const RECOVERY_DATA = [
    { name: 'ADVANCE R 125', id_ref: 'advance_r_125', url: 'https://www.auteco.com.co/moto-victory-advance-r-125/p', cc: 124, warranty: '24 meses o 24.000 km' },
    { name: 'AGILITY FUSION TRAKKU', id_ref: 'agility_fusion_trakku', url: 'https://www.auteco.com.co/moto-kymco-agility-fusion-trakku/p?skuId=21130162', cc: 124.6, warranty: '12 meses o 20.000 km' },
    { name: 'APACHE 160 CARBURADA ABS', id_ref: 'apache_160_carburada_abs', url: 'https://www.auteco.com.co/apache-rtr-160-4v-xconnect-abs/p?skuId=21135507', cc: 159.7, warranty: '24 meses o 24.000 km' },
    { name: 'BET ABS', id_ref: 'bet_abs', url: 'https://www.auteco.com.co/moto-victory-bet-abs/p', cc: 149.2, warranty: '24 meses o 24.000 km' },
    { name: 'COOL JOY', id_ref: 'cool_joy', url: 'https://www.auteco.com.co/moto-electrica-starker-cooljoy/p', cc: 0, warranty: '12 meses' }, // Electric
    { name: 'ECOMAD', id_ref: 'ecomad', url: 'https://www.auteco.com.co/patineta-electrica-velocifero-ecomad/p', cc: 0, warranty: '12 meses' }, // Electric
    { name: 'IQUBE', id_ref: 'iqube', url: 'https://www.auteco.com.co/moto-electrica-tvs-iqube/p?skuId=21133890', cc: 0, warranty: '24 meses' }, // Electric
    { name: 'NINJA 500', id_ref: 'ninja_500', url: 'https://www.auteco.com.co/kawasaki-ninja-500/p?skuId=21135427', cc: 451, warranty: '12 meses o 20.000 km' },
    { name: 'NITRO 125 TRAKKU', id_ref: 'nitro_125_trakku', url: 'https://www.auteco.com.co/moto-victory-nitro-125-trakku/p', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'NTORQ 125 XCONNECT FI', id_ref: 'ntorq_125_xconnect_fi', url: 'https://www.auteco.com.co/moto-tvs-ntorq-125-xconnect-fi/p?skuId=21135498', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'RAIDER 125', id_ref: 'raider_125', url: 'https://www.auteco.com.co/moto-tvs-raider-125/p?skuId=21135480', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'RAIDER 125 FI', id_ref: 'raider_125_fi', url: 'https://www.auteco.com.co/moto-tvs-raider-125-fi/p?skuId=21135502', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'RONIN 225 TD', id_ref: 'ronin_225_td', url: 'https://www.auteco.com.co/moto-tvs-ronin-225-td/p?skuId=21108520', cc: 225.9, warranty: '24 meses o 24.000 km' },
    { name: 'STAR KIDS', id_ref: 'star_kids', url: 'https://www.auteco.com.co/moto-electrica-starker-star-kids/p?skuId=21116561', cc: 0, warranty: '6 meses' },
    { name: 'STAR KIDS PRO', id_ref: 'star_kids_pro', url: 'https://www.auteco.com.co/moto-electrica-starker-star-kids-pro/p?skuId=21011740', cc: 0, warranty: '6 meses' },
    { name: 'SWITCH 125', id_ref: 'switch_125', url: 'https://www.auteco.com.co/moto-victory-switch-125/p', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'SWITCH 125 TK', id_ref: 'switch_125_tk', url: 'https://www.auteco.com.co/moto-victory-switch-125-tk/p', cc: 124.8, warranty: '24 meses o 24.000 km' },
    { name: 'TNT 25N', id_ref: 'tnt_25n', url: 'https://www.auteco.com.co/moto-benelli-tnt-25n/p', cc: 249, warranty: '12 meses o 20.000 km' },
    { name: 'TRICARGO 300', id_ref: 'tricargo_300', url: 'https://www.auteco.com.co/motocarro-ceronte-tricargo-300/p', cc: 272, warranty: '6 meses o 6.000 km' },
    { name: 'TRK 251', id_ref: 'trk_251', url: 'https://www.auteco.com.co/moto-benelli-trk-251/p', cc: 249, warranty: '12 meses o 20.000 km' },
    { name: 'VERSYS 300 ABS', id_ref: 'versys_300_abs', url: 'https://www.auteco.com.co/moto-kawasaki-versys-300-abs/p?skuId=21130346', cc: 296, warranty: '12 meses o 20.000 km' },
    { name: 'VOLTA 350', id_ref: 'volta_350', url: 'https://www.auteco.com.co/patineta-electrica-starker-volta-350/p', cc: 0, warranty: '6 meses' },
    { name: 'Z500', id_ref: 'z500', url: 'https://www.auteco.com.co/kawasaki-z500/p?skuId=21135415', cc: 451, warranty: '12 meses o 20.000 km' }
];

async function main() {
    console.log('🚀 Starting Urgent DB Fix...');

    try {
        // 1. Authenticate
        console.log('🔑 Authenticating...');
        try {
            await signInAnonymously(auth);
            console.log('✅ Authenticated Anonymously');
        } catch (e: any) {
            console.error('❌ Auth Failed:', e.message);
            // If auth fails, we might still be able to run if rules allow unauthed writes (unlikely) BUT
            // if we are running locally with admin credentials in env, maybe we can fallback? 
            // For now, proceed.
        }

        // 2. Fetch All Items to Create a Lookup Map
        console.log('📥 Fetching Inventory...');
        const itemsRef = collection(db, 'pagina', 'catalogo', 'items');
        const snapshot = await getDocs(itemsRef);
        console.log(`📊 Found ${snapshot.docs.length} items in DB.`);

        // 3. Process Each Recovery Item
        for (const target of RECOVERY_DATA) {
            // Find the doc
            const docFound = snapshot.docs.find(d => {
                const data = d.data();
                const ref = (data.referencia || '').toLowerCase().trim();
                const name = (data.name || '').toLowerCase().trim();
                const targetName = target.name.toLowerCase().trim();

                // Fuzzy match or exact match
                return ref === targetName || name === targetName || ref.includes(target.id_ref.replace(/_/g, ' '));
            });

            if (docFound) {
                const data = docFound.data();
                console.log(`🔧 Updating [${docFound.id}] ${target.name}...`);

                // Prepare Update
                const updatePayload: any = {
                    displacement: target.cc,
                    external_url: target.url, // Fix the link for future syncs
                    last_updated_manual: new Date(),
                    manual_fix_applied: true
                };

                // Only update warranty if we have a string
                if (target.warranty) {
                    updatePayload.warranty = target.warranty;
                }

                await updateDoc(doc(db, 'pagina', 'catalogo', 'items', docFound.id), updatePayload);
                console.log(`   ✅ Success! CC: ${target.cc}, URL Linked.`);
            } else {
                console.warn(`   ⚠️  NOT FOUND: ${target.name} (Ref: ${target.id_ref})`);
            }
        }

        console.log('\n✅ All Critical Updates Completed.');
        process.exit(0);

    } catch (e) {
        console.error('❌ Fatal Error:', e);
        process.exit(1);
    }
}

main();
