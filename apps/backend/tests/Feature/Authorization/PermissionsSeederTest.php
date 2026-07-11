<?php

declare(strict_types=1);

use App\Authorization\Contracts\Permission;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission as PermissionModel;

uses(RefreshDatabase::class);

enum FixtureAlphaPermission: string implements Permission
{
    case View = 'alpha.view';
    case Create = 'alpha.create';
}

enum FixtureBetaPermission: string implements Permission
{
    case Manage = 'beta.manage';
}

beforeEach(function (): void {
    PermissionModel::query()->delete();
});

it('upserts every enum case as a permission row (happy path)', function (): void {
    $seeder = new PermissionsSeeder([
        FixtureAlphaPermission::class,
        FixtureBetaPermission::class,
    ]);

    $seeder->run();

    expect(PermissionModel::pluck('name')->sort()->values()->all())
        ->toEqual(['alpha.create', 'alpha.view', 'beta.manage']);
});

it('removes orphan rows whose name is no longer in any enum (garbage path)', function (): void {
    PermissionModel::create(['name' => 'orphan.permission', 'guard_name' => 'web']);

    $seeder = new PermissionsSeeder([FixtureAlphaPermission::class]);
    $seeder->run();

    expect(PermissionModel::pluck('name')->sort()->values()->all())
        ->toEqual(['alpha.create', 'alpha.view']);
});

it('rejects classes that are not BackedEnum implements Permission (invalid path)', function (): void {
    $seeder = new PermissionsSeeder([stdClass::class]);

    expect(fn () => $seeder->run())->toThrow(InvalidArgumentException::class);
});
