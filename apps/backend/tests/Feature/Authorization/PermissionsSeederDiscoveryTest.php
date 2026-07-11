<?php

declare(strict_types=1);

use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission as PermissionModel;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    PermissionModel::query()->delete();

    $this->fixtureDir = app_path('Modules/Fixture/Domain');
    if (! is_dir($this->fixtureDir)) {
        mkdir($this->fixtureDir, 0755, recursive: true);
    }
    $this->fixtureFile = $this->fixtureDir.DIRECTORY_SEPARATOR.'FixturePermission.php';
    file_put_contents($this->fixtureFile, <<<'PHP'
<?php

declare(strict_types=1);

namespace App\Modules\Fixture\Domain;

use App\Authorization\Contracts\Permission;

enum FixturePermission: string implements Permission
{
    case Read  = 'fixture.read';
    case Write = 'fixture.write';
}
PHP);

    require_once $this->fixtureFile;
});

afterEach(function (): void {
    if (isset($this->fixtureFile) && file_exists($this->fixtureFile)) {
        unlink($this->fixtureFile);
    }
    if (isset($this->fixtureDir) && is_dir($this->fixtureDir)) {
        rmdir($this->fixtureDir);
        $parent = dirname($this->fixtureDir);
        if (is_dir($parent) && count(scandir($parent)) === 2) {
            rmdir($parent);
        }
    }
});

it('discovers Permission enums under app/Modules via reflection (happy)', function (): void {
    $seeder = new PermissionsSeeder;
    $seeder->run();

    $names = PermissionModel::pluck('name')->all();
    expect($names)->toContain('fixture.read');
    expect($names)->toContain('fixture.write');
});

it('returns only real module rows when fixture is absent (happy edge)', function (): void {
    if (file_exists($this->fixtureFile)) {
        unlink($this->fixtureFile);
    }
    if (is_dir($this->fixtureDir)) {
        rmdir($this->fixtureDir);
    }

    $seeder = new PermissionsSeeder;
    $seeder->run();

    $names = PermissionModel::pluck('name')->all();
    expect($names)->not->toContain('fixture.read');
    expect($names)->not->toContain('fixture.write');
});

it('is idempotent — running twice leaves the same state (happy)', function (): void {
    $seeder = new PermissionsSeeder;
    $seeder->run();
    $firstCount = PermissionModel::count();
    $firstNames = PermissionModel::pluck('name')->sort()->values()->all();

    $seeder->run();
    $secondCount = PermissionModel::count();
    $secondNames = PermissionModel::pluck('name')->sort()->values()->all();

    expect($secondCount)->toBe($firstCount);
    expect($secondNames)->toEqual($firstNames);
    expect($firstNames)->toContain('fixture.read');
    expect($firstNames)->toContain('fixture.write');
});
