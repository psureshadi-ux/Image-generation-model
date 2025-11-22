import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const formData = await request.formData();

    const prompt = formData.get('prompt') as string;
    const aspectRatio = formData.get('aspect_ratio') as string;
    const resolution = formData.get('resolution') as string;
    const outputFormat = formData.get('output_format') as string;
    const imageFiles = formData.getAll('images') as File[];

    if (!prompt || !aspectRatio || !resolution || !outputFormat) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const imageUrls: string[] = [];

    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        if (file.size > 0) {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('nano_nanana_pro')
            .upload(fileName, file, {
              contentType: file.type,
              cacheControl: '3600',
            });

          if (uploadError) {
            console.error('Error uploading file:', uploadError);

            return NextResponse.json(
              { error: `Failed to upload image: ${uploadError.message}` },
              { status: 500 }
            );
          }

          const { data: urlData } = supabase.storage
            .from('nano_nanana_pro')
            .getPublicUrl(uploadData.path);

          imageUrls.push(urlData.publicUrl);
        }
      }
    }

    const { data: insertData, error: insertError } = await supabase
      .from('image_generation_requests')
      .insert({
        prompt,
        images: imageUrls,
        aspect_ratio: aspectRatio,
        resolution,
        output_format: outputFormat,
        status: 'running',
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting record:', insertError);
      return NextResponse.json(
        { error: `Failed to create request: ${insertError.message}` },
        { status: 500 }
      );
    }

    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: insertData.id }),
        });
      } catch (webhookError) {
        console.error('Error sending webhook:', webhookError);
      }
    }

    return NextResponse.json({
      success: true,
      id: insertData.id,
    });
  } catch (error) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
