'use client';

import { Database } from '@/types/database.types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Image, Video, Music, Archive, File, Trash2 } from 'lucide-react';

type Asset = Database['public']['Tables']['course_assets']['Row'];

interface AssetListProps {
  assets: Asset[];
  onDelete: (id: string) => void;
}

const fileTypeIcons = {
  pptx: FileText,
  pdf: FileText,
  docx: FileText,
  png: Image,
  jpg: Image,
  jpeg: Image,
  mp4: Video,
  mp3: Music,
  wav: Music,
  zip: Archive,
};

const statusText = {
  uploaded: 'הועלה',
  processing: 'בעיבוד',
  processed: 'עובד',
  failed: 'נכשל',
};

const statusColor = {
  uploaded: 'bg-slate-100 text-slate-700',
  processing: 'bg-blue-100 text-blue-700',
  processed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export function AssetList({ assets, onDelete }: AssetListProps) {
  if (assets.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-slate-500">
          אין קבצים. העלה קבצים כדי להתחיל.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {assets.map((asset) => {
        const Icon = fileTypeIcons[asset.file_type as keyof typeof fileTypeIcons] || File;
        const sizeInMB = (asset.size_bytes / 1024 / 1024).toFixed(2);

        return (
          <Card key={asset.id}>
            <CardContent className="flex flex-col md:flex-row md:items-center md:justify-between p-4 gap-3">
              <div className="flex items-center space-x-3 space-x-reverse flex-1 min-w-0">
                <Icon className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{asset.original_name}</p>
                  <p className="text-sm text-slate-500">
                    {sizeInMB} MB · {asset.file_type.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end space-x-2 space-x-reverse">
                <Badge className={statusColor[asset.status]}>{statusText[asset.status]}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(asset.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
