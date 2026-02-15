'use client';

import * as React from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

const DesktopContext = React.createContext<boolean | undefined>(undefined);

function useIsDesktop() {
  const context = React.useContext(DesktopContext);
  if (context === undefined) {
    throw new Error('useIsDesktop must be used within ResponsiveAlertDialog');
  }
  return context;
}

interface ResponsiveAlertDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ResponsiveAlertDialog({
  children,
  open,
  onOpenChange,
}: ResponsiveAlertDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const ProviderComponent = (
    <DesktopContext.Provider value={isDesktop}>
      {children}
    </DesktopContext.Provider>
  );

  if (isDesktop) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        {ProviderComponent}
      </AlertDialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {ProviderComponent}
    </Drawer>
  );
}

export function ResponsiveAlertDialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogContent className={className}>{children}</AlertDialogContent>;
  }

  return <DrawerContent className={className}>{children}</DrawerContent>;
}

export function ResponsiveAlertDialogHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogHeader className={className}>{children}</AlertDialogHeader>;
  }

  return <DrawerHeader className={className}>{children}</DrawerHeader>;
}

export function ResponsiveAlertDialogTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogTitle className={className}>{children}</AlertDialogTitle>;
  }

  return <DrawerTitle className={className}>{children}</DrawerTitle>;
}

export function ResponsiveAlertDialogDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogDescription className={className}>{children}</AlertDialogDescription>;
  }

  return <DrawerDescription className={className}>{children}</DrawerDescription>;
}

export function ResponsiveAlertDialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogFooter className={className}>{children}</AlertDialogFooter>;
  }

  return <div className={`px-4 pb-4 pt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end ${className || ''}`}>{children}</div>;
}

export function ResponsiveAlertDialogAction({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return (
      <AlertDialogAction onClick={onClick} className={className}>
        {children}
      </AlertDialogAction>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 w-full ${className || ''}`}
    >
      {children}
    </button>
  );
}

export function ResponsiveAlertDialogCancel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <AlertDialogCancel className={className}>{children}</AlertDialogCancel>;
  }

  return (
    <button
      className={`inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 w-full ${className || ''}`}
    >
      {children}
    </button>
  );
}
