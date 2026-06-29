'use client';

import React from 'react';
import AnomaliesBanner, { Anomaly } from '@/components/admin/AnomaliesBanner';

// Custom lightweight test runner to avoid missing Jest/Vitest global types
function describe(name: string, fn: () => void) {
    console.log(`\nSuite: ${name}`);
    fn();
}

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  ✓ ${name} - PASSED`);
    } catch (error) {
        console.error(`  ✗ ${name} - FAILED`);
        throw error;
    }
}

interface StyleContext {
    backgroundColor: string;
    color: string;
}

// Contrast calculation functions conforming to WCAG 2.0 specifications
function parseColor(color: string): { r: number; g: number; b: number; a: number } {
    const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const rgbaRegex = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

    if (hexRegex.test(color)) {
        let hex = color.slice(1);
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 1.0
        };
    }

    const match = color.match(rgbaRegex);
    if (match) {
        return {
            r: parseInt(match[1], 10),
            g: parseInt(match[2], 10),
            b: parseInt(match[3], 10),
            a: match[4] !== undefined ? parseFloat(match[4]) : 1.0
        };
    }

    if (color === 'white' || color === '#ffffff') return { r: 255, g: 255, b: 255, a: 1.0 };
    if (color === 'black' || color === '#000000') return { r: 0, g: 0, b: 0, a: 1.0 };
    
    throw new Error(`Unsupported color format: ${color}`);
}

function blendColors(childColorStr: string, parentColorStr: string): string {
    const child = parseColor(childColorStr);
    if (child.a === 1.0) {
        return childColorStr;
    }
    const parent = parseColor(parentColorStr);
    const r = Math.round(child.r * child.a + parent.r * (1 - child.a));
    const g = Math.round(child.g * child.a + parent.g * (1 - child.a));
    const b = Math.round(child.b * child.a + parent.b * (1 - child.a));
    return `rgb(${r}, ${g}, ${b})`;
}

function getLuminance(colorStr: string): number {
    const color = parseColor(colorStr);
    const a = [color.r, color.g, color.b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function getContrastRatio(color1: string, color2: string): number {
    const lum1 = getLuminance(color1);
    const lum2 = getLuminance(color2);
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    return (brightest + 0.05) / (darkest + 0.05);
}

// Running the tests
describe('AnomaliesBanner Rendering and WCAG AA Contrast Test', () => {
    
    test('renders null when there are no anomalies', () => {
        const result = AnomaliesBanner({ anomalies: [] });
        if (result !== null) {
            throw new Error('Expected AnomaliesBanner to render null when anomalies list is empty');
        }
    });

    test('renders anomalies and complies with WCAG AA contrast ratio >= 4.5', () => {
        // canonical immutable payload
        const mockAnomaly: Anomaly = {
            id: 'mock-anomaly-842',
            severity: 'ERROR',
            user_id: '5730000000',
            query: 'Boxer 100',
            message: 'CATALOG_VALIDATION_FAIL'
        };

        const result = AnomaliesBanner({ anomalies: [mockAnomaly] });
        if (!result) {
            throw new Error('Expected AnomaliesBanner to render element tree, but got null');
        }

        // Test assertions for fields
        const assertions = [
            { name: 'severity', regex: /ERROR/i, matched: false },
            { name: 'user_id', regex: /Usuario:\s*5730000000/, matched: false },
            { name: 'message', regex: /CATALOG_VALIDATION_FAIL/, matched: false },
            { name: 'query', regex: /Boxer\s+100/, matched: false }
        ];

        function traverseReactTree(
            node: React.ReactNode,
            currentStyle: StyleContext = { backgroundColor: '#111827', color: '#ffffff' }
        ) {
            if (!node) return;

            if (Array.isArray(node)) {
                node.forEach(child => traverseReactTree(child, currentStyle));
                return;
            }

            if (typeof node === 'string' || typeof node === 'number') {
                const text = String(node);
                
                assertions.forEach(assertion => {
                    if (assertion.regex.test(text) && !assertion.matched) {
                        assertion.matched = true;
                        const ratio = getContrastRatio(currentStyle.color, currentStyle.backgroundColor);
                        
                        console.log(`    [MATCH] Field "${assertion.name}" with value "${text}"`);
                        console.log(`            Text Color: ${currentStyle.color}`);
                        console.log(`            Bg Color  : ${currentStyle.backgroundColor}`);
                        console.log(`            Contrast  : ${ratio.toFixed(2)}:1`);

                        if (ratio < 4.5) {
                            throw new Error(
                                `WCAG AA Contrast Violation on "${assertion.name}": ` +
                                `Contrast ratio ${ratio.toFixed(2)}:1 is below the required 4.5:1`
                            );
                        }
                    }
                });
                return;
            }

            if (typeof node === 'object' && 'props' in node) {
                const element = node as React.ReactElement;
                const props = element.props as any;
                let nextStyle = { ...currentStyle };
                const elementStyle = props?.style;
                
                if (elementStyle) {
                    if (elementStyle.backgroundColor) {
                        const bgStr = elementStyle.backgroundColor;
                        if (bgStr.startsWith('rgba') || bgStr.startsWith('rgb')) {
                            nextStyle.backgroundColor = blendColors(bgStr, currentStyle.backgroundColor);
                        } else {
                            nextStyle.backgroundColor = bgStr;
                        }
                    }
                    if (elementStyle.color) {
                        nextStyle.color = elementStyle.color;
                    }
                }

                // Check direct children text content (handles concatenated text like "Usuario: 5730000000")
                const children = props?.children;
                const directText = Array.isArray(children)
                    ? children.filter(c => typeof c === 'string' || typeof c === 'number').join('')
                    : (typeof children === 'string' || typeof children === 'number' ? String(children) : '');

                if (directText) {
                    assertions.forEach(assertion => {
                        if (assertion.regex.test(directText) && !assertion.matched) {
                            assertion.matched = true;
                            const ratio = getContrastRatio(nextStyle.color, nextStyle.backgroundColor);
                            
                            console.log(`    [MATCH] Field "${assertion.name}" with value "${directText}"`);
                            console.log(`            Text Color: ${nextStyle.color}`);
                            console.log(`            Bg Color  : ${nextStyle.backgroundColor}`);
                            console.log(`            Contrast  : ${ratio.toFixed(2)}:1`);

                            if (ratio < 4.5) {
                                throw new Error(
                                    `WCAG AA Contrast Violation on "${assertion.name}": ` +
                                    `Contrast ratio ${ratio.toFixed(2)}:1 is below the required 4.5:1`
                                );
                            }
                        }
                    });
                }

                if (children) {
                    traverseReactTree(children, nextStyle);
                }
            }
        }

        // Run the traversal to find fields and verify contrast
        traverseReactTree(result);

        // Verify that all assertions matched
        assertions.forEach(assertion => {
            if (!assertion.matched) {
                throw new Error(`Field assertion "${assertion.name}" failed: regex ${assertion.regex} was not found in the rendered tree`);
            }
        });
    });
});

// Self-execution trigger when running as a script
if (typeof require !== 'undefined' && require.main === module) {
    console.log('Running AnomaliesBanner test suite directly...');
}
