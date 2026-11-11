import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('render harness smoke', () => {
    it('renderiza JSX sin plugin React', () => {
        render(<div>harness-ok</div>);

        expect(screen.getByText('harness-ok')).toBeInTheDocument();
    });
});
