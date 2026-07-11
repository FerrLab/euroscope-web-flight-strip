<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Filament\Pages;

use App\Modules\Ping\Presentation\Filament\PingResource;
use Filament\Resources\Pages\ListRecords;

class ListPings extends ListRecords
{
    protected static string $resource = PingResource::class;
}
