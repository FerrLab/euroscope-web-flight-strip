<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Authorization\Contracts\Permission;
use Illuminate\Database\Seeder;
use InvalidArgumentException;
use ReflectionClass;
use Spatie\Permission\Models\Permission as PermissionModel;
use Spatie\Permission\PermissionRegistrar;

class PermissionsSeeder extends Seeder
{
    /**
     * @param  array<int, class-string>  $permissionEnums
     *                                                     Defaults to all PHP enums anywhere under app/Modules that implement
     *                                                     the Permission contract. Tests inject a fixture list to bypass
     *                                                     discovery.
     */
    public function __construct(private array $permissionEnums = [])
    {
        if ($permissionEnums === []) {
            $this->permissionEnums = $this->discoverPermissionEnums();
        }
    }

    public function run(): void
    {
        $expected = $this->collectExpectedNames();

        foreach ($expected as $name) {
            PermissionModel::firstOrCreate(['name' => $name, 'guard_name' => 'web']);
        }

        PermissionModel::query()
            ->whereNotIn('name', $expected)
            ->delete();

        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    /**
     * @return array<int, string>
     */
    private function collectExpectedNames(): array
    {
        $names = [];
        foreach ($this->permissionEnums as $enumClass) {
            $reflection = new ReflectionClass($enumClass);
            if (! $reflection->implementsInterface(Permission::class)) {
                throw new InvalidArgumentException(
                    "{$enumClass} must be a BackedEnum implementing ".Permission::class
                );
            }
            foreach ($enumClass::cases() as $case) {
                $names[] = $case->value;
            }
        }

        return $names;
    }

    /**
     * @return array<int, class-string>
     */
    private function discoverPermissionEnums(): array
    {
        $found = [];
        $modulesDir = app_path('Modules');
        if (! is_dir($modulesDir)) {
            return $found;
        }

        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($modulesDir, \RecursiveDirectoryIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'php') {
                continue;
            }
            $relative = str_replace(
                [$modulesDir, DIRECTORY_SEPARATOR, '/', '.php'],
                ['', '\\', '\\', ''],
                $file->getPathname(),
            );
            $fqcn = 'App\\Modules'.$relative;
            if (! class_exists($fqcn) && ! enum_exists($fqcn)) {
                continue;
            }
            $reflection = new ReflectionClass($fqcn);
            if ($reflection->isEnum()
                && $reflection->implementsInterface(Permission::class)) {
                $found[] = $fqcn;
            }
        }

        return $found;
    }
}
