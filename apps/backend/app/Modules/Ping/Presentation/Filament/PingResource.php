<?php

declare(strict_types=1);

namespace App\Modules\Ping\Presentation\Filament;

use App\Modules\Ping\Domain\PingPermission;
use App\Modules\Ping\Infrastructure\PingModel;
use App\Modules\Ping\Presentation\Filament\Pages\ListPings;
use BackedEnum;
use Filament\Forms\Components\KeyValue;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class PingResource extends Resource
{
    protected static ?string $model = PingModel::class;

    protected static ?string $slug = 'pings';

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-bell';

    public static function getNavigationGroup(): ?string
    {
        return __('ping.navigation.group');
    }

    public static function getNavigationLabel(): string
    {
        return __('ping.navigation.label');
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            KeyValue::make('note')
                ->keyLabel(__('ping.note.locale_label'))
                ->valueLabel(__('ping.note.value_label'))
                ->required(),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('id')->limit(8)->toggleable(),
                TextColumn::make('user.email')->label(__('ping.fields.user'))->sortable(),
                TextColumn::make('note.en')->label(__('ping.fields.note_en'))->limit(60),
                TextColumn::make('created_at')->dateTime()->sortable(),
            ])
            ->defaultSort('created_at', 'desc');
    }

    public static function canViewAny(): bool
    {
        return auth()->user()?->can(PingPermission::View->value) ?? false;
    }

    public static function canCreate(): bool
    {
        return auth()->user()?->can(PingPermission::Create->value) ?? false;
    }

    public static function getPages(): array
    {
        return [
            'index' => ListPings::route('/'),
        ];
    }
}
