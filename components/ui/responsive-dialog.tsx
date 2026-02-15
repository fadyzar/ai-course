'use client';

import * as React from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

const DesktopContext = React.createContext<boolean | undefined>(undefined);

function useIsDesktop() {
  const context = React.useContext(DesktopContext);
  if (context === undefined) {
    throw new Error('useIsDesktop must be used within ResponsiveDialog');
  }
  return context;
}

interface ResponsiveDialogProps {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ResponsiveDialog({
  children,
  open,
  onOpenChange,
}: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const ProviderComponent = (
    <DesktopContext.Provider value={isDesktop}>
      {children}
    </DesktopContext.Provider>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {ProviderComponent}
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {ProviderComponent}
    </Drawer>
  );
}

export function ResponsiveDialogTrigger({
  children,
  asChild,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogTrigger asChild={asChild}>{children}</DialogTrigger>;
  }

  return <DrawerTrigger asChild={asChild}>{children}</DrawerTrigger>;
}

export function ResponsiveDialogContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogContent className={className}>{children}</DialogContent>;
  }

  return <DrawerContent className={className}>{children}</DrawerContent>;
}

export function ResponsiveDialogHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogHeader className={className}>{children}</DialogHeader>;
  }

  return <DrawerHeader className={className}>{children}</DrawerHeader>;
}

export function ResponsiveDialogTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogTitle className={className}>{children}</DialogTitle>;
  }

  return <DrawerTitle className={className}>{children}</DrawerTitle>;
}

export function ResponsiveDialogDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <DialogDescription className={className}>{children}</DialogDescription>;
  }

  return <DrawerDescription className={className}>{children}</DrawerDescription>;
}

export function ResponsiveDialogFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isDesktop = useIsDesktop();

  if (isDesktop) {
    return <div className={className}>{children}</div>;
  }

  return <div className={`px-4 pb-4 pt-2 ${className || ''}`}>{children}</div>;
}
