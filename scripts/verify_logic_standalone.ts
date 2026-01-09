
// Standalone Verification of the New Parsing Logic
const testCases = [
    { input: "124.8", expected: 124.8 },
    { input: "124,8", expected: 124.8 },
    { input: "124.8 cc", expected: 124.8 },
    { input: "124,8 cm3", expected: 124.8 },
    { input: "150", expected: 150 },
    { input: "1000", expected: 1000 },
    { input: "124", expected: 124 },
    { input: "undefined", expected: 0 },
    { input: "null", expected: 0 },
    { input: "random text", expected: 0 },
];

function parseDisplacement(raw: any) {
    if (!raw) return 0;
    // [FIX] Improved Parsing Logic for Decimals (e.g. "124.8")
    // 1. Convert to string and lower case
    let clean = String(raw).toLowerCase();
    // 2. Remove common units FIRST to avoid keeping digits like '3' from 'cm3'
    clean = clean.replace(/cc|cm3|cm|c\.c\.|l/g, '');
    // 3. Replace comma with dot for consistency
    clean = clean.replace(/,/g, '.');
    // 4. Remove everything that is NOT a digit or a dot
    clean = clean.replace(/[^0-9.]/g, '');
    // 5. Parse float
    return parseFloat(clean) || 0;
}

console.log("Running Parsing Logic Verification...");
let passed = 0;
testCases.forEach(({ input, expected }) => {
    const result = parseDisplacement(input);
    const success = result === expected;
    if (success) passed++;
    console.log(`Input: "${input}" -> Output: ${result} | Expected: ${expected} | ${success ? '✅ PASS' : '❌ FAIL'}`);
});

console.log(`\nResult: ${passed}/${testCases.length} Passed.`);
if (passed === testCases.length) {
    console.log("Logic Verification SUCCESSFUL.");
} else {
    console.log("Logic Verification FAILED.");
    process.exit(1);
}
