// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  tabsListVariants,
} from './Tabs';

describe('Tabs', () => {
  it('renders default tab content and switches tabs', () => {
    render(
      <Tabs defaultValue="first">
        <TabsList>
          <TabsTrigger value="first">First</TabsTrigger>
          <TabsTrigger value="second">Second</TabsTrigger>
        </TabsList>
        <TabsContent value="first">Alpha panel</TabsContent>
        <TabsContent value="second">Beta panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByText('Alpha panel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Second' }));
    expect(screen.getByText('Beta panel')).toBeInTheDocument();
  });

  it('applies line variant classes and respects disabled triggers', () => {
    render(
      <Tabs defaultValue="first" orientation="vertical">
        <TabsList variant="line">
          <TabsTrigger value="first">Enabled</TabsTrigger>
          <TabsTrigger disabled={true} value="second">
            Disabled
          </TabsTrigger>
        </TabsList>
        <TabsContent value="first">Visible panel</TabsContent>
        <TabsContent value="second">Hidden panel</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole('tablist').className).toContain(
      tabsListVariants({ variant: 'line' })
    );
    expect(screen.getByRole('tab', { name: 'Disabled' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    expect(screen.getByText('Visible panel')).toBeInTheDocument();
  });
});
